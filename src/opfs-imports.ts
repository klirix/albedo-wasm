import type { BrowserEnvHelpers } from "./browser-imports";

const ERROR_OK = 0;
const ERROR_NOT_FOUND = 1;
const ERROR_PERMISSION = 2;
const ERROR_UNEXPECTED = 4;

export type OpfsSyncAccessHandle = {
  read(buffer: Uint8Array, options?: { at?: number }): number;
  write(buffer: Uint8Array, options?: { at?: number }): number;
  truncate(newSize: number): void;
  getSize(): number;
  flush(): void;
  close(): void;
};

type FileHandleWithSyncAccess = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<OpfsSyncAccessHandle>;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

type WasmHandleInfo = {
  path: string;
  access: OpfsSyncAccessHandle;
  wasmPtr: number;
  wasmLen: number;
};

export type OpfsEnvHelpers = BrowserEnvHelpers;

const opfsFiles = new Map<string, OpfsSyncAccessHandle>();

export function normalizeOpfsPath(path: string): string {
  return path.replace(/^[./]+/, "");
}

function normalizePath(path: string): string {
  return normalizeOpfsPath(path);
}

export function getOpfsFileMap(): Map<string, OpfsSyncAccessHandle> {
  return opfsFiles;
}

export async function ensureOpfsFile(
  path: string,
  root?: FileSystemDirectoryHandle,
): Promise<OpfsSyncAccessHandle> {
  const key = normalizePath(path);
  const existing = opfsFiles.get(key);
  if (existing) return existing;
  const dir = root ?? (await navigator.storage.getDirectory());
  const handle = (await dir.getFileHandle(key, {
    create: true,
  })) as FileHandleWithSyncAccess;
  const access = await handle.createSyncAccessHandle();
  opfsFiles.set(key, access);
  return access;
}

export async function closeOpfsBackend(): Promise<void> {
  for (const access of opfsFiles.values()) {
    try {
      access.flush();
      access.close();
    } catch {
      // Handles may already be closed if the worker is tearing down.
    }
  }
  opfsFiles.clear();
}

function throwUnexpected(err: unknown): number {
  console.error("OPFS error:", err);
  if (err instanceof DOMException) {
    if (err.name === "NotFoundError") return ERROR_NOT_FOUND;
    if (err.name === "NoModificationAllowedError") return ERROR_PERMISSION;
    if (err.name === "InvalidStateError") return ERROR_PERMISSION;
  }
  return ERROR_UNEXPECTED;
}

/**
 * Pre-open OPFS files with synchronous access handles.
 * Must run in a dedicated Worker — `createSyncAccessHandle()` is Worker-only.
 */
export async function prepareOpfsFiles(
  paths: string[],
  root?: FileSystemDirectoryHandle,
): Promise<Map<string, OpfsSyncAccessHandle>> {
  for (const path of paths) {
    await ensureOpfsFile(path, root);
  }
  return opfsFiles;
}

export async function clearOpfsFiles(
  paths?: string[],
  root?: FileSystemDirectoryHandle,
): Promise<void> {
  const dir = root ?? (await navigator.storage.getDirectory());
  if (paths) {
    for (const rawPath of paths) {
      try {
        await dir.removeEntry(normalizePath(rawPath));
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "NotFoundError")) {
          throw err;
        }
      }
    }
    return;
  }
  for await (const [name] of (dir as DirectoryWithEntries).entries()) {
    await dir.removeEntry(name);
  }
}

export function createOpfsEnvImports(
  helpers: OpfsEnvHelpers,
  files: Map<string, OpfsSyncAccessHandle> = opfsFiles,
) {
  const handles = new Map<string, WasmHandleInfo>();
  let nextHandleId = 1;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function decodeString(ptr: number, len: number): string {
    const buffer = helpers.getMemoryBuffer();
    if (!buffer) return "";
    return decoder.decode(new Uint8Array(buffer, ptr, len));
  }

  function memorySlice(ptr: number, len: number): Uint8Array | null {
    const buffer = helpers.getMemoryBuffer();
    if (!buffer) return null;
    return new Uint8Array(buffer, ptr, len);
  }

  function lookupFile(path: string): OpfsSyncAccessHandle | undefined {
    return files.get(normalizePath(path));
  }

  return {
    wasm_open_file(
      pathPtr: number,
      pathLen: number,
      _readFlag: number,
      _writeFlag: number,
      createFlag: number,
      truncateFlag: number,
      outHandlePtr: number,
    ): number {
      try {
        const path = normalizePath(decodeString(pathPtr, pathLen));
        const access = lookupFile(path);
        if (!access) {
          return createFlag ? ERROR_UNEXPECTED : ERROR_NOT_FOUND;
        }
        // An empty pre-created OPFS file must look like "not found" so Albedo
        // initializes a new bucket instead of reading a missing header.
        if (!createFlag && access.getSize() === 0) {
          return ERROR_NOT_FOUND;
        }
        if (truncateFlag) {
          access.truncate(0);
        }

        const handleId = `h${nextHandleId++}`;
        const bytes = encoder.encode(handleId);
        const alloc = helpers.allocHandleBytes(bytes);
        if (!helpers.writeHandleStruct(outHandlePtr, alloc.ptr, alloc.len)) {
          helpers.freeAlloc(alloc.ptr, alloc.len);
          return ERROR_UNEXPECTED;
        }

        handles.set(handleId, {
          path,
          access,
          wasmPtr: alloc.ptr,
          wasmLen: alloc.len,
        });
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_close_file(handlePtr: number, handleLen: number): number {
      try {
        const handleId = decodeString(handlePtr, handleLen);
        const info = handles.get(handleId);
        if (!info) return ERROR_NOT_FOUND;
        info.access.flush();
        helpers.freeAlloc(info.wasmPtr, info.wasmLen);
        handles.delete(handleId);
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_pread(
      handlePtr: number,
      handleLen: number,
      offset: number | bigint,
      destPtr: number,
      destLen: number,
      outReadPtr: number,
    ): number {
      try {
        const handleId = decodeString(handlePtr, handleLen);
        const info = handles.get(handleId);
        if (!info) return ERROR_NOT_FOUND;
        const dest = memorySlice(destPtr, destLen);
        if (!dest) return ERROR_UNEXPECTED;
        const tmp = new Uint8Array(destLen);
        const bytesRead = info.access.read(tmp, {
          at: helpers.toNumber(offset),
        });
        if (bytesRead > 0) dest.set(tmp.subarray(0, bytesRead));
        if (!helpers.writeUsize(outReadPtr, bytesRead)) return ERROR_UNEXPECTED;
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_pwrite(
      handlePtr: number,
      handleLen: number,
      offset: number | bigint,
      srcPtr: number,
      srcLen: number,
      outWrittenPtr: number,
    ): number {
      try {
        const handleId = decodeString(handlePtr, handleLen);
        const info = handles.get(handleId);
        if (!info) return ERROR_NOT_FOUND;
        const src = memorySlice(srcPtr, srcLen);
        if (!src) return ERROR_UNEXPECTED;
        const tmp = src.slice();
        const bytesWritten = info.access.write(tmp, {
          at: helpers.toNumber(offset),
        });
        info.access.flush();
        if (!helpers.writeUsize(outWrittenPtr, bytesWritten)) {
          return ERROR_UNEXPECTED;
        }
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_sync(handlePtr: number, handleLen: number): number {
      try {
        const handleId = decodeString(handlePtr, handleLen);
        const info = handles.get(handleId);
        if (!info) return ERROR_NOT_FOUND;
        info.access.flush();
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_delete_file(pathPtr: number, pathLen: number): number {
      try {
        const path = normalizePath(decodeString(pathPtr, pathLen));
        const access = lookupFile(path);
        if (!access) return ERROR_NOT_FOUND;
        access.truncate(0);
        access.flush();
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_rename_file(
      oldPtr: number,
      oldLen: number,
      newPtr: number,
      newLen: number,
    ): number {
      try {
        const oldPath = normalizePath(decodeString(oldPtr, oldLen));
        const newPath = normalizePath(decodeString(newPtr, newLen));
        const from = lookupFile(oldPath);
        const to = lookupFile(newPath);
        if (!from || !to) return ERROR_NOT_FOUND;
        const size = from.getSize();
        const buf = new Uint8Array(size);
        if (size > 0) from.read(buf, { at: 0 });
        to.truncate(0);
        if (size > 0) to.write(buf, { at: 0 });
        to.flush();
        from.truncate(0);
        from.flush();
        return ERROR_OK;
      } catch (err) {
        return throwUnexpected(err);
      }
    },

    wasm_random_bytes(destPtr: number, destLen: number): number {
      const dest = memorySlice(destPtr, destLen);
      if (!dest) return ERROR_UNEXPECTED;
      crypto.getRandomValues(dest);
      return ERROR_OK;
    },

    wasm_now_seconds(outPtr: number): number {
      const seconds = BigInt(Math.floor(Date.now() / 1000));
      return helpers.writeI64(outPtr, seconds) ? ERROR_OK : ERROR_UNEXPECTED;
    },

    wasm_log(msgPtr: number, msgLen: number): void {
      console.log(`[WASM]: ${decodeString(msgPtr, msgLen)}`);
    },
  };
}

export type OpfsEnvImports = ReturnType<typeof createOpfsEnvImports>;
