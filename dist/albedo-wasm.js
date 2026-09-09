import { serialize, deserialize } from "./bson";
import { Query, isQueryObject, } from "./query";
export * from "./bson";
export * from "./query";
const wasmUrl = new URL("./albedo.wasm", import.meta.url);
async function loadWasmBytes(url) {
    if (typeof Bun !== "undefined" && typeof Bun.file === "function") {
        return Bun.file(wasmUrl).arrayBuffer();
    }
    if (isBrowserEnvironment() && typeof fetch === "function") {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM module (${response.status})`);
        }
        return response.arrayBuffer();
    }
    const fs = await import("fs/promises");
    const buffer = await fs.readFile(url);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
function isBrowserEnvironment() {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
async function resolveEnvImports(helpers) {
    console.log(isBrowserEnvironment() ? "Browser environment" : "Node.js environment");
    if (isBrowserEnvironment()) {
        return import("./browser-imports").then(({ createBrowserEnvImports }) => {
            return createBrowserEnvImports(helpers);
        });
    }
    return import("./node-imports").then(({ createNodeEnvImports }) => {
        return createNodeEnvImports(helpers);
    });
}
let wasmModule;
const encoder = new TextEncoder();
let wasmInstance = null;
let wasmExports = null;
let wasmMemory = null;
function getWasmExports() {
    if (wasmExports)
        return wasmExports;
    if (!wasmInstance)
        return null;
    wasmExports = wasmInstance.exports;
    wasmMemory = wasmExports.memory;
    return wasmExports;
}
function getMemory() {
    if (wasmMemory)
        return wasmMemory;
    const exports = getWasmExports();
    if (!exports)
        return null;
    wasmMemory = exports.memory;
    return wasmMemory;
}
function getMemoryBuffer() {
    const memory = getMemory();
    return memory ? memory.buffer : null;
}
function requireExports() {
    const exports = getWasmExports();
    if (!exports) {
        throw new Error("Albedo WASM exports not ready");
    }
    return exports;
}
function encodeCString(value) {
    const stringBytes = encoder.encode(value);
    const withNull = new Uint8Array(stringBytes.length + 1);
    withNull.set(stringBytes);
    withNull[stringBytes.length] = 0;
    return withNull;
}
function writeBytes(ptr, bytes) {
    const buffer = getMemoryBuffer();
    if (!buffer)
        return false;
    new Uint8Array(buffer, ptr, bytes.length).set(bytes);
    return true;
}
function writeHandleStruct(outPtr, handlePtr, handleLen) {
    const buffer = getMemoryBuffer();
    if (!buffer)
        return false;
    const view = new DataView(buffer);
    view.setUint32(outPtr, handlePtr, true);
    view.setUint32(outPtr + 4, handleLen, true);
    return true;
}
function writeUsize(outPtr, value) {
    const buffer = getMemoryBuffer();
    if (!buffer)
        return false;
    const view = new DataView(buffer);
    view.setUint32(outPtr, value, true);
    return true;
}
function writeI64(outPtr, value) {
    const buffer = getMemoryBuffer();
    if (!buffer)
        return false;
    const view = new DataView(buffer);
    view.setBigInt64(outPtr, value, true);
    return true;
}
function readPtr(ptr) {
    const buffer = getMemoryBuffer();
    if (!buffer)
        return 0;
    const view = new DataView(buffer);
    return view.getUint32(ptr, true);
}
function mallocZero(size) {
    const exports = requireExports();
    const ptr = exports.albedo_malloc(size);
    if (ptr === 0) {
        throw new Error(`Failed to allocate ${size} bytes in WASM memory`);
    }
    const buffer = getMemoryBuffer();
    if (!buffer) {
        throw new Error("WASM memory unavailable");
    }
    new Uint8Array(buffer, ptr, size).fill(0);
    return ptr;
}
function toNumber(value) {
    return typeof value === "bigint" ? Number(value) : value;
}
function allocHandleBytes(bytes) {
    const exports = requireExports();
    const ptr = exports.albedo_malloc(bytes.length);
    if (ptr === 0) {
        throw new Error("Failed to allocate WASM memory");
    }
    if (!writeBytes(ptr, bytes)) {
        exports.albedo_free(ptr, bytes.length);
        throw new Error("Failed to copy data into WASM memory");
    }
    return { ptr, len: bytes.length };
}
function freeAlloc(ptr, len) {
    if (ptr === 0 || len === 0)
        return;
    const exports = requireExports();
    exports.albedo_free(ptr, len);
}
function copyBsonBytes(ptr) {
    const buffer = getMemoryBuffer();
    if (!buffer) {
        throw new Error("WASM memory unavailable");
    }
    const len = new DataView(buffer).getInt32(ptr, true);
    return new Uint8Array(buffer.slice(ptr, ptr + len));
}
function readOwnedBson(ptrPtr) {
    const ptr = readPtr(ptrPtr);
    if (ptr === 0) {
        throw new Error("Received null document pointer from WASM module");
    }
    const bytes = copyBsonBytes(ptr);
    freeAlloc(ptr, bytes.length);
    return bytes;
}
const envHelpers = {
    getMemoryBuffer,
    writeHandleStruct,
    writeUsize,
    writeI64,
    allocHandleBytes,
    freeAlloc,
    toNumber,
};
const envImports = await resolveEnvImports(envHelpers);
export async function compileWasmModule(url) {
    url = url || wasmUrl;
    if (typeof WebAssembly.compileStreaming === "function" &&
        typeof fetch === "function") {
        try {
            wasmModule = await WebAssembly.compileStreaming(fetch(url));
            wasmInstance = await WebAssembly.instantiate(wasmModule, {
                env: envImports,
            });
            return wasmModule;
        }
        catch (err) {
            if (!(err instanceof TypeError)) {
                throw err;
            }
        }
    }
    const bytes = await loadWasmBytes(url);
    wasmModule = await WebAssembly.compile(bytes);
    wasmInstance = await WebAssembly.instantiate(wasmModule, { env: envImports });
    return wasmModule;
}
if (!isBrowserEnvironment()) {
    wasmModule = await compileWasmModule(wasmUrl);
}
export { wasmInstance };
const ResultCode = {
    OK: 0,
    Error: 1,
    HasData: 2,
    EOS: 3,
    OutOfMemory: 4,
    FileNotFound: 5,
    NotFound: 6,
    InvalidFormat: 7,
    DuplicateKey: 8,
    InvalidCursor: 9,
    UnsupportedCursorQuery: 10,
    OplogGap: 11,
    ReplicationGap: 12,
    TransactionActive: 13,
    InvalidTransaction: 14,
    TransactionBusy: 15,
};
const RESULT_NAMES = {
    [ResultCode.OK]: "OK",
    [ResultCode.Error]: "Error",
    [ResultCode.HasData]: "HasData",
    [ResultCode.EOS]: "EOS",
    [ResultCode.OutOfMemory]: "OutOfMemory",
    [ResultCode.FileNotFound]: "FileNotFound",
    [ResultCode.NotFound]: "NotFound",
    [ResultCode.InvalidFormat]: "InvalidFormat",
    [ResultCode.DuplicateKey]: "DuplicateKey",
    [ResultCode.InvalidCursor]: "InvalidCursor",
    [ResultCode.UnsupportedCursorQuery]: "UnsupportedCursorQuery",
    [ResultCode.OplogGap]: "OplogGap",
    [ResultCode.ReplicationGap]: "ReplicationGap",
    [ResultCode.TransactionActive]: "TransactionActive",
    [ResultCode.InvalidTransaction]: "InvalidTransaction",
    [ResultCode.TransactionBusy]: "TransactionBusy",
};
function resultName(code) {
    return RESULT_NAMES[code] ?? `code ${code}`;
}
function throwResult(code, action) {
    throw new Error(`Failed to ${action} (${resultName(code)})`);
}
function convertToQuery(query, options) {
    let base;
    if (query instanceof Query) {
        base = { ...query.query };
    }
    else if (query instanceof Uint8Array) {
        base = deserialize(query);
    }
    else if (isQueryObject(query)) {
        base = { ...query };
    }
    else {
        base = { query: query ?? {} };
    }
    if (options?.sort)
        base.sort = options.sort;
    if (options?.sector)
        base.sector = options.sector;
    if (options?.projection)
        base.projection = options.projection;
    if (options?.cursor)
        base.cursor = options.cursor;
    return base;
}
function queryBytes(query, options) {
    if (query instanceof Uint8Array && !options)
        return query;
    const encoded = serialize(convertToQuery(query, options));
    return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}
function documentBytes(doc) {
    if (doc instanceof Uint8Array)
        return doc;
    const encoded = serialize(doc);
    return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}
function programBytes(program) {
    if (program instanceof Uint8Array)
        return program;
    if (Array.isArray(program)) {
        const obj = {};
        program.forEach((stage, index) => {
            obj[String(index)] = stage;
        });
        return documentBytes(obj);
    }
    return documentBytes(program);
}
function assertU16(len, label) {
    if (len > 0xffff) {
        throw new Error(`${label} payload too large for WASM bridge`);
    }
}
function writeDoc(exports, bytes) {
    const ptr = exports.albedo_malloc(bytes.length);
    if (ptr === 0) {
        throw new Error("Failed to allocate WASM memory");
    }
    new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
    return ptr;
}
function callUpdate(fn, query, program, action) {
    const exports = requireExports();
    const qBytes = queryBytes(query);
    const pBytes = programBytes(program);
    assertU16(qBytes.length, "Query");
    assertU16(pBytes.length, "Update program");
    const queryPtr = writeDoc(exports, qBytes);
    const programPtr = writeDoc(exports, pBytes);
    const outPtr = mallocZero(4);
    try {
        const result = fn(queryPtr, qBytes.length, programPtr, pBytes.length, outPtr);
        if (result !== ResultCode.OK)
            throwResult(result, action);
        return readPtr(outPtr);
    }
    finally {
        freeAlloc(queryPtr, qBytes.length);
        freeAlloc(programPtr, pBytes.length);
        freeAlloc(outPtr, 4);
    }
}
function* iterateTransform(exports, iterHandle) {
    const dataPtrPtr = exports.albedo_malloc(4);
    try {
        while (true) {
            const res = exports.albedo_transform_data(iterHandle, dataPtrPtr);
            if (res === ResultCode.EOS)
                break;
            if (res !== ResultCode.OK) {
                throwResult(res, "read transform iterator");
            }
            const docPtr = readPtr(dataPtrPtr);
            if (docPtr === 0) {
                throw new Error("Received null document pointer from WASM module");
            }
            const currentDoc = deserialize(copyBsonBytes(docPtr));
            const transformDoc = yield currentDoc;
            let transformPtr = 0;
            let transformLen = 0;
            if (transformDoc === undefined) {
                transformPtr = docPtr;
            }
            else if (transformDoc === null) {
                transformPtr = 0;
            }
            else {
                const transformBytes = documentBytes(transformDoc);
                transformLen = transformBytes.length;
                transformPtr = writeDoc(exports, transformBytes);
            }
            try {
                const applyRes = exports.albedo_transform_apply(iterHandle, transformPtr);
                if (applyRes !== ResultCode.OK) {
                    throwResult(applyRes, "apply transformation");
                }
            }
            finally {
                if (transformDoc !== undefined && transformDoc !== null) {
                    exports.albedo_free(transformPtr, transformLen);
                }
            }
        }
    }
    finally {
        if (iterHandle !== 0) {
            exports.albedo_transform_close(iterHandle);
        }
        exports.albedo_free(dataPtrPtr, 4);
    }
}
function openTransform(exports, ownerPtr, query, viaTransaction) {
    const qBytes = queryBytes(query);
    const queryPtr = writeDoc(exports, qBytes);
    const iterPtrPtr = mallocZero(4);
    try {
        const res = viaTransaction
            ? exports.albedo_transaction_transform(ownerPtr, queryPtr, iterPtrPtr)
            : exports.albedo_transform(ownerPtr, queryPtr, iterPtrPtr);
        if (res !== ResultCode.OK)
            throwResult(res, "create transform iterator");
        const iterHandle = readPtr(iterPtrPtr);
        if (iterHandle === 0) {
            throw new Error("Received null iterator handle from WASM module");
        }
        return iterHandle;
    }
    finally {
        freeAlloc(queryPtr, qBytes.length);
        freeAlloc(iterPtrPtr, 4);
    }
}
function aggregateErrors(message, errors) {
    return new AggregateError(errors, message);
}
export class Transaction {
    constructor(pointer) {
        this.pointer = pointer;
        this.exports = requireExports();
    }
    insert(data) {
        const dataBytes = documentBytes(data);
        const dataPtr = writeDoc(this.exports, dataBytes);
        try {
            const result = this.exports.albedo_transaction_insert(this.pointer, dataPtr);
            if (result !== ResultCode.OK)
                throwResult(result, "insert in transaction");
        }
        finally {
            freeAlloc(dataPtr, dataBytes.length);
        }
    }
    delete(query = {}) {
        const qBytes = queryBytes(query);
        assertU16(qBytes.length, "Query");
        const queryPtr = writeDoc(this.exports, qBytes);
        try {
            const result = this.exports.albedo_transaction_delete(this.pointer, queryPtr, qBytes.length);
            if (result !== ResultCode.OK)
                throwResult(result, "delete in transaction");
        }
        finally {
            freeAlloc(queryPtr, qBytes.length);
        }
    }
    *transformCursor(query = {}) {
        const iterHandle = openTransform(this.exports, this.pointer, query, true);
        yield* iterateTransform(this.exports, iterHandle);
    }
    transformIterator(query = {}) {
        return this.transformCursor(query);
    }
    transform(query, mutator) {
        const cursor = this.transformCursor(query ?? {});
        let step = cursor.next();
        while (!step.done) {
            step = cursor.next(mutator(step.value));
        }
    }
    update(query, mutator) {
        this.transform(query, mutator);
    }
    transfigurate(query, program) {
        return callUpdate((queryPtr, queryLen, programPtr, programLen, outUpdatedPtr) => this.exports.albedo_transaction_update(this.pointer, queryPtr, queryLen, programPtr, programLen, outUpdatedPtr), query, program, "apply update program in transaction");
    }
    commit() {
        const result = this.exports.albedo_transaction_commit(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "commit transaction");
    }
    rollback() {
        const result = this.exports.albedo_transaction_rollback(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "rollback transaction");
    }
    close() {
        const result = this.exports.albedo_transaction_close(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "close transaction");
    }
}
export class Bucket {
    constructor(pointer) {
        this.pointer = pointer;
        this.exports = requireExports();
    }
    get memory() {
        return new DataView(this.exports.memory.buffer);
    }
    insert(data) {
        const dataBytes = documentBytes(data);
        const dataPtr = writeDoc(this.exports, dataBytes);
        try {
            const result = this.exports.albedo_insert(this.pointer, dataPtr);
            if (result !== ResultCode.OK)
                throwResult(result, "insert into Albedo database");
        }
        finally {
            freeAlloc(dataPtr, dataBytes.length);
        }
    }
    static open(path, options) {
        const exports = requireExports();
        const dbPtrPtr = mallocZero(4);
        const pathAlloc = allocHandleBytes(encodeCString(path));
        let optionsAlloc = null;
        let bucketPtr = 0;
        try {
            let result;
            if (options) {
                optionsAlloc = allocHandleBytes(documentBytes(options));
                result = exports.albedo_open_with_options(pathAlloc.ptr, optionsAlloc.ptr, dbPtrPtr);
            }
            else {
                result = exports.albedo_open(pathAlloc.ptr, dbPtrPtr);
            }
            if (result !== ResultCode.OK)
                throwResult(result, "open Albedo database");
            bucketPtr = readPtr(dbPtrPtr);
            if (bucketPtr === 0) {
                throw new Error("Received null bucket pointer from WASM module");
            }
        }
        finally {
            freeAlloc(pathAlloc.ptr, pathAlloc.len);
            if (optionsAlloc)
                freeAlloc(optionsAlloc.ptr, optionsAlloc.len);
            freeAlloc(dbPtrPtr, 4);
        }
        return new Bucket(bucketPtr);
    }
    close() {
        const result = this.exports.albedo_close(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "close Albedo database");
    }
    vacuum() {
        const result = this.exports.albedo_vacuum(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "vacuum Albedo database");
    }
    checkpoint() {
        const result = this.exports.albedo_checkpoint(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "checkpoint Albedo database");
    }
    flush() {
        const result = this.exports.albedo_flush(this.pointer);
        if (result !== ResultCode.OK)
            throwResult(result, "flush Albedo database");
    }
    ensureIndex(field, options = Bucket.defaultIndexOptions) {
        let optionFlags = 0;
        if (options.unique)
            optionFlags |= 1 << 0;
        if (options.sparse)
            optionFlags |= 1 << 1;
        if (options.reverse)
            optionFlags |= 1 << 2;
        const pathAlloc = allocHandleBytes(encodeCString(field));
        try {
            const res = this.exports.albedo_ensure_index(this.pointer, pathAlloc.ptr, optionFlags);
            if (res !== ResultCode.OK) {
                throwResult(res, "create index in Albedo database");
            }
        }
        finally {
            freeAlloc(pathAlloc.ptr, pathAlloc.len);
        }
    }
    dropIndex(field) {
        const pathAlloc = allocHandleBytes(encodeCString(field));
        try {
            const res = this.exports.albedo_drop_index(this.pointer, pathAlloc.ptr);
            if (res === ResultCode.OK)
                return true;
            if (res === ResultCode.NotFound)
                return false;
            throwResult(res, "drop index in Albedo database");
        }
        finally {
            freeAlloc(pathAlloc.ptr, pathAlloc.len);
        }
    }
    listIndexes() {
        const outPtr = mallocZero(4);
        try {
            const res = this.exports.albedo_list_indexes(this.pointer, outPtr);
            if (res !== ResultCode.OK)
                throwResult(res, "list indexes");
            const doc = deserialize(readOwnedBson(outPtr));
            const indexes = doc.indexes ?? {};
            const mapped = {};
            for (const [name, options] of Object.entries(indexes)) {
                mapped[name] = {
                    name,
                    unique: Boolean(options?.unique),
                    sparse: Boolean(options?.sparse),
                    reverse: Boolean(options?.reverse),
                };
            }
            return mapped;
        }
        finally {
            freeAlloc(outPtr, 4);
        }
    }
    get indexes() {
        return this.listIndexes();
    }
    delete(query = {}, options = {}) {
        const qBytes = queryBytes(query, options);
        assertU16(qBytes.length, "Query");
        const queryPtr = writeDoc(this.exports, qBytes);
        try {
            const result = this.exports.albedo_delete(this.pointer, queryPtr, qBytes.length);
            if (result !== ResultCode.OK) {
                throwResult(result, "delete from Albedo database");
            }
        }
        finally {
            this.exports.albedo_free(queryPtr, qBytes.length);
        }
    }
    *list(query = {}, options = {}) {
        const qBytes = queryBytes(query, options);
        const queryPtr = writeDoc(this.exports, qBytes);
        const iterPtrPtr = mallocZero(4);
        let iterHandle = 0;
        try {
            const res = this.exports.albedo_list(this.pointer, queryPtr, iterPtrPtr);
            if (res !== ResultCode.OK)
                throwResult(res, "list Albedo database");
            iterHandle = readPtr(iterPtrPtr);
            if (iterHandle === 0) {
                throw new Error("Received null iterator handle from WASM module");
            }
        }
        finally {
            this.exports.albedo_free(queryPtr, qBytes.length);
            this.exports.albedo_free(iterPtrPtr, 4);
        }
        const dataPtrPtr = this.exports.albedo_malloc(4);
        try {
            while (true) {
                const res = this.exports.albedo_data(iterHandle, dataPtrPtr);
                if (res === ResultCode.EOS)
                    break;
                if (res !== ResultCode.OK) {
                    throwResult(res, "get data from Albedo database");
                }
                const docPtr = readPtr(dataPtrPtr);
                if (docPtr === 0) {
                    throw new Error("Received null document pointer from WASM module");
                }
                const shouldQuit = yield deserialize(copyBsonBytes(docPtr));
                if (shouldQuit)
                    break;
            }
        }
        finally {
            if (iterHandle !== 0) {
                this.exports.albedo_close_iterator(iterHandle);
            }
            this.exports.albedo_free(dataPtrPtr, 4);
        }
    }
    exportCursor(query = {}, options = {}) {
        const qBytes = queryBytes(query, options);
        const queryPtr = writeDoc(this.exports, qBytes);
        const iterPtrPtr = mallocZero(4);
        let iterHandle = 0;
        try {
            const res = this.exports.albedo_list(this.pointer, queryPtr, iterPtrPtr);
            if (res !== ResultCode.OK)
                throwResult(res, "list Albedo database");
            iterHandle = readPtr(iterPtrPtr);
            if (iterHandle === 0) {
                throw new Error("Received null iterator handle from WASM module");
            }
        }
        finally {
            freeAlloc(queryPtr, qBytes.length);
            freeAlloc(iterPtrPtr, 4);
        }
        const outPtr = mallocZero(4);
        try {
            const res = this.exports.albedo_list_cursor_export(iterHandle, outPtr);
            if (res !== ResultCode.OK)
                throwResult(res, "export list cursor");
            return deserialize(readOwnedBson(outPtr));
        }
        finally {
            if (iterHandle !== 0) {
                this.exports.albedo_close_iterator(iterHandle);
            }
            freeAlloc(outPtr, 4);
        }
    }
    all(query = {}, options = {}) {
        return this.list(query, options).toArray();
    }
    get(query = {}, options = {}) {
        const iter = this.list(query, options);
        const result = iter.next(true);
        iter.next(true);
        if (result.done)
            return null;
        return result.value;
    }
    one(query = {}, options = {}) {
        return this.get(query, options);
    }
    *transformCursor(query = {}) {
        const iterHandle = openTransform(this.exports, this.pointer, query, false);
        yield* iterateTransform(this.exports, iterHandle);
    }
    transformIterator(query = {}) {
        return this.transformCursor(query);
    }
    transform(query, mutator) {
        const cursor = this.transformCursor(query ?? {});
        let step = cursor.next();
        while (!step.done) {
            step = cursor.next(mutator(step.value));
        }
    }
    update(query, mutator) {
        this.transform(query, mutator);
    }
    transfigurate(query, program) {
        return callUpdate((queryPtr, queryLen, programPtr, programLen, outUpdatedPtr) => this.exports.albedo_update(this.pointer, queryPtr, queryLen, programPtr, programLen, outUpdatedPtr), query, program, "apply update program");
    }
    beginTransaction() {
        const outPtr = mallocZero(4);
        try {
            const result = this.exports.albedo_transaction_begin(this.pointer, outPtr);
            if (result !== ResultCode.OK)
                throwResult(result, "begin transaction");
            const txPtr = readPtr(outPtr);
            if (txPtr === 0) {
                throw new Error("Received null transaction pointer from WASM module");
            }
            return new Transaction(txPtr);
        }
        finally {
            freeAlloc(outPtr, 4);
        }
    }
    tx(fn) {
        const tx = this.beginTransaction();
        let result;
        try {
            result = fn(tx);
        }
        catch (error) {
            try {
                tx.rollback();
            }
            catch (rollbackError) {
                try {
                    tx.close();
                }
                catch (closeError) {
                    throw aggregateErrors("Transaction failed, rollback failed, and close failed", [error, rollbackError, closeError]);
                }
                throw aggregateErrors("Transaction failed and rollback failed", [
                    error,
                    rollbackError,
                ]);
            }
            try {
                tx.close();
            }
            catch (closeError) {
                throw aggregateErrors("Transaction failed and close failed", [
                    error,
                    closeError,
                ]);
            }
            throw error;
        }
        try {
            tx.commit();
        }
        catch (commitError) {
            try {
                tx.close();
            }
            catch (closeError) {
                throw aggregateErrors("Transaction commit and close both failed", [
                    commitError,
                    closeError,
                ]);
            }
            throw commitError;
        }
        tx.close();
        return result;
    }
    async *subscribe(query = {}, options) {
        const pollingTimeout = options?.pollingTimeout ?? 50;
        const batchSize = options?.batchSize ?? 64;
        const qBytes = queryBytes(query);
        const queryPtr = writeDoc(this.exports, qBytes);
        const outPtr = mallocZero(4);
        let handle = 0;
        try {
            const res = this.exports.albedo_subscribe(this.pointer, queryPtr, outPtr);
            if (res !== ResultCode.OK)
                throwResult(res, "subscribe to Albedo changes");
            handle = readPtr(outPtr);
            if (handle === 0) {
                throw new Error("Received null subscription handle from WASM module");
            }
        }
        finally {
            freeAlloc(queryPtr, qBytes.length);
            freeAlloc(outPtr, 4);
        }
        const docPtrPtr = mallocZero(4);
        try {
            while (true) {
                const res = this.exports.albedo_subscribe_poll(handle, docPtrPtr, batchSize);
                if (res === ResultCode.HasData) {
                    const docPtr = readPtr(docPtrPtr);
                    const batch = deserialize(copyBsonBytes(docPtr));
                    for (const event of batch.batch ?? []) {
                        yield event;
                    }
                }
                else if (res === ResultCode.EOS) {
                    await new Promise((resolve) => setTimeout(resolve, pollingTimeout));
                }
                else {
                    throwResult(res, "poll subscription");
                }
            }
        }
        finally {
            this.exports.albedo_subscribe_close(handle);
            freeAlloc(docPtrPtr, 4);
        }
    }
    static convertToQuery(query, options) {
        return convertToQuery(query, options);
    }
}
Bucket.defaultIndexOptions = {
    unique: false,
    sparse: false,
    reverse: false,
};
export default {
    Bucket,
    Transaction,
    Query,
    version() {
        return requireExports().albedo_version();
    },
    bitsize() {
        return requireExports().albedo_bitsize();
    },
};
//# sourceMappingURL=albedo-wasm.js.map