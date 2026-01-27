import * as fs from "fs";
import path from "path";
import { randomFillSync } from "crypto";
const ERROR_OK = 0;
const ERROR_NOT_FOUND = 1;
const ERROR_PERMISSION = 2;
const ERROR_ALREADY_EXISTS = 3;
const ERROR_UNEXPECTED = 4;
function mapFsError(err) {
    if (!(err instanceof Error)) {
        return ERROR_UNEXPECTED;
    }
    const code = err.code;
    switch (code) {
        case "ENOENT":
            return ERROR_NOT_FOUND;
        case "EACCES":
        case "EPERM":
            return ERROR_PERMISSION;
        case "EEXIST":
            return ERROR_ALREADY_EXISTS;
        default:
            return ERROR_UNEXPECTED;
    }
}
function resolveFilePath(p) {
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}
export function createNodeEnvImports(helpers) {
    const handles = new Map();
    let nextHandleId = 1;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    function decodeString(ptr, len) {
        const buffer = helpers.getMemoryBuffer();
        if (!buffer)
            return "";
        return decoder.decode(new Uint8Array(buffer, ptr, len));
    }
    function memoryBufferSlice(ptr, len) {
        const buffer = helpers.getMemoryBuffer();
        if (!buffer)
            return null;
        return Buffer.from(buffer, ptr, len);
    }
    return {
        wasm_open_file(pathPtr, pathLen, readFlag, writeFlag, createFlag, truncateFlag, outHandlePtr) {
            try {
                const filePath = decodeString(pathPtr, pathLen);
                const resolved = resolveFilePath(filePath);
                const read = Boolean(readFlag);
                const write = Boolean(writeFlag);
                const create = Boolean(createFlag);
                const truncate = Boolean(truncateFlag);
                const constants = fs.constants;
                let flags = 0;
                if (read && write) {
                    flags |= constants.O_RDWR;
                }
                else if (write) {
                    flags |= constants.O_WRONLY;
                }
                else {
                    flags |= constants.O_RDONLY;
                }
                if (create)
                    flags |= constants.O_CREAT;
                if (truncate)
                    flags |= constants.O_TRUNC;
                const fd = fs.openSync(resolved, flags, 0o666);
                const handleId = `h${nextHandleId++}`;
                const bytes = encoder.encode(handleId);
                let alloc;
                try {
                    alloc = helpers.allocHandleBytes(bytes);
                }
                catch (_err) {
                    fs.closeSync(fd);
                    return ERROR_UNEXPECTED;
                }
                if (!helpers.writeHandleStruct(outHandlePtr, alloc.ptr, alloc.len)) {
                    fs.closeSync(fd);
                    helpers.freeAlloc(alloc.ptr, alloc.len);
                    return ERROR_UNEXPECTED;
                }
                handles.set(handleId, {
                    fd,
                    path: resolved,
                    wasmPtr: alloc.ptr,
                    wasmLen: alloc.len,
                });
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_close_file(handlePtr, handleLen) {
            try {
                const handleId = decodeString(handlePtr, handleLen);
                const info = handles.get(handleId);
                if (!info)
                    return ERROR_NOT_FOUND;
                fs.closeSync(info.fd);
                helpers.freeAlloc(info.wasmPtr, info.wasmLen);
                handles.delete(handleId);
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_pread(handlePtr, handleLen, offset, destPtr, destLen, outReadPtr) {
            try {
                const handleId = decodeString(handlePtr, handleLen);
                const info = handles.get(handleId);
                if (!info)
                    return ERROR_NOT_FOUND;
                const dest = memoryBufferSlice(destPtr, destLen);
                if (!dest)
                    return ERROR_UNEXPECTED;
                const bytesRead = fs.readSync(info.fd, dest, 0, destLen, helpers.toNumber(offset));
                if (!helpers.writeUsize(outReadPtr, bytesRead))
                    return ERROR_UNEXPECTED;
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_pwrite(handlePtr, handleLen, offset, srcPtr, srcLen, outWrittenPtr) {
            try {
                const handleId = decodeString(handlePtr, handleLen);
                const info = handles.get(handleId);
                if (!info)
                    return ERROR_NOT_FOUND;
                const src = memoryBufferSlice(srcPtr, srcLen);
                if (!src)
                    return ERROR_UNEXPECTED;
                const bytesWritten = fs.writeSync(info.fd, src, 0, srcLen, helpers.toNumber(offset));
                if (!helpers.writeUsize(outWrittenPtr, bytesWritten))
                    return ERROR_UNEXPECTED;
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_sync(handlePtr, handleLen) {
            try {
                const handleId = decodeString(handlePtr, handleLen);
                const info = handles.get(handleId);
                if (!info)
                    return ERROR_NOT_FOUND;
                fs.fsyncSync(info.fd);
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_delete_file(pathPtr, pathLen) {
            try {
                const filePath = decodeString(pathPtr, pathLen);
                const resolved = resolveFilePath(filePath);
                fs.unlinkSync(resolved);
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_rename_file(oldPtr, oldLen, newPtr, newLen) {
            try {
                const oldPath = resolveFilePath(decodeString(oldPtr, oldLen));
                const newPath = resolveFilePath(decodeString(newPtr, newLen));
                fs.renameSync(oldPath, newPath);
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_random_bytes(destPtr, destLen) {
            try {
                const dest = memoryBufferSlice(destPtr, destLen);
                if (!dest)
                    return ERROR_UNEXPECTED;
                randomFillSync(dest);
                return ERROR_OK;
            }
            catch (err) {
                return mapFsError(err);
            }
        },
        wasm_now_seconds(outPtr) {
            const seconds = BigInt(Math.floor(Date.now() / 1000));
            return helpers.writeI64(outPtr, seconds) ? ERROR_OK : ERROR_UNEXPECTED;
        },
        wasm_log(msgPtr, msgLen) {
            const msg = decodeString(msgPtr, msgLen);
            console.log(`[WASM]: ${msg}`);
        },
    };
}
//# sourceMappingURL=node-imports.js.map