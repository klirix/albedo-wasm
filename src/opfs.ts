import {
  Bucket as CoreBucket,
  compileWasmModule,
  getWasmEnvHelpers,
  isWasmReady,
  type OpenBucketOptions,
} from "./albedo-wasm";
import {
  closeOpfsBackend,
  createOpfsEnvImports,
  ensureOpfsFile,
  getOpfsFileMap,
  normalizeOpfsPath,
} from "./opfs-imports";

export {
  ObjectId,
  Query,
  compileWasmModule,
  where,
} from "./albedo-wasm";
export type {
  OpenBucketOptions,
  QueryInput,
  QueryObject,
} from "./albedo-wasm";

export type OpfsOpenOptions = OpenBucketOptions & {
  /** Bundlers should pass `import wasm from "albedo-wasm/albedo.wasm?url"`. */
  wasmUrl?: string | URL;
};

const defaultWasmUrl = new URL("./albedo.wasm", import.meta.url);

async function installOpfsBackend(
  path: string,
  wasmUrl?: string | URL,
): Promise<void> {
  const bucketPath = normalizeOpfsPath(path);
  await ensureOpfsFile(bucketPath);
  await ensureOpfsFile(`${bucketPath}-temp`);

  if (isWasmReady()) return;

  const env = createOpfsEnvImports(getWasmEnvHelpers(), getOpfsFileMap());
  await compileWasmModule(wasmUrl ?? defaultWasmUrl, env);
}

async function openOpfsBucket(
  path: string,
  options: OpfsOpenOptions = {},
): Promise<CoreBucket> {
  const { wasmUrl, ...bucketOptions } = options;
  await installOpfsBackend(path, wasmUrl);
  return CoreBucket.open(path, {
    wal: false,
    auto_vaccuum: false,
    ...bucketOptions,
  });
}

/**
 * OPFS-backed bucket. `open` is async because sync access handles must be
 * created before WASM file I/O. Import this from a dedicated Worker:
 *
 * ```ts
 * import { Bucket } from "albedo-wasm/opfs";
 * import wasmUrl from "albedo-wasm/albedo.wasm?url";
 * const bucket = await Bucket.open("todos.bucket", { wasmUrl });
 * ```
 *
 * WAL is unavailable on wasm32. A sibling `-temp` file is pre-opened for
 * vacuum; auto-vacuum stays off by default because OPFS rename is copy+truncate.
 */
export const Bucket = {
  open: openOpfsBucket,
  defaultIndexOptions: CoreBucket.defaultIndexOptions,
  convertToQuery: CoreBucket.convertToQuery,
};

export type Bucket = CoreBucket;

export { closeOpfsBackend as closeOpfs };
