import { serialize, deserialize, type ObjectId } from "./bson";
import type { NodeEnvHelpers, NodeEnvImports } from "./node-imports";
import type { BrowserEnvHelpers, BrowserEnvImports } from "./browser-imports";
import {
  Query,
  isQueryObject,
  type QueryClause,
  type QueryInput,
  type QueryObject,
} from "./query";
export * from "./bson";
export * from "./query";

const wasmUrl = new URL("./albedo.wasm", import.meta.url);

async function loadWasmBytes(url: URL | string): Promise<ArrayBuffer> {
  if (typeof fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM module (${response.status})`);
    }
    return response.arrayBuffer();
  }
  if (typeof Bun !== "undefined" && typeof Bun.file === "function") {
    return Bun.file(url).arrayBuffer();
  }
  const fs = await import(/* @vite-ignore */ "fs/promises");
  const buffer = await fs.readFile(url);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

type EnvHelpers = NodeEnvHelpers & BrowserEnvHelpers;
type EnvImports = NodeEnvImports | BrowserEnvImports;

function isDedicatedWorker(): boolean {
  return typeof (globalThis as { importScripts?: unknown }).importScripts ===
    "function";
}

async function resolveEnvImports(helpers: EnvHelpers): Promise<EnvImports | null> {
  if (isBrowserEnvironment()) {
    console.log("Browser environment");
    return import("./browser-imports").then(({ createBrowserEnvImports }) => {
      return createBrowserEnvImports(helpers);
    });
  }
  if (isDedicatedWorker()) {
    return null;
  }
  console.log("Node.js environment");
  return import(/* @vite-ignore */ "./node-imports").then(
    ({ createNodeEnvImports }) => {
      return createNodeEnvImports(helpers);
    },
  );
}

let wasmModule;

const encoder = new TextEncoder();

type WasmExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  albedo_malloc: (size: number) => number;
  albedo_free: (ptr: number, size: number) => void;
  albedo_open: (pathPtr: number, bucketOutPtr: number) => number;
  albedo_open_with_options: (
    pathPtr: number,
    optionsPtr: number,
    bucketOutPtr: number,
  ) => number;
  albedo_close: (bucketHandle: number) => number;
  albedo_insert: (bucketHandle: number, dataPtr: number) => number;
  albedo_vacuum: (bucketHandle: number) => number;
  albedo_checkpoint: (bucketHandle: number) => number;
  albedo_flush: (bucketHandle: number) => number;
  albedo_ensure_index: (
    bucketHandle: number,
    pathPtr: number,
    optionsByte: number,
  ) => number;
  albedo_drop_index: (bucketHandle: number, pathPtr: number) => number;
  albedo_list_indexes: (bucketHandle: number, outDocPtr: number) => number;
  albedo_delete: (
    bucketHandle: number,
    queryPtr: number,
    queryLen: number,
  ) => number;
  albedo_update: (
    bucketHandle: number,
    queryPtr: number,
    queryLen: number,
    programPtr: number,
    programLen: number,
    outUpdatedPtr: number,
  ) => number;
  albedo_list: (
    bucketHandle: number,
    queryPtr: number,
    outIterPtr: number,
  ) => number;
  albedo_data: (iterHandle: number, outDocPtr: number) => number;
  albedo_list_cursor_export: (iterHandle: number, outCursorPtr: number) => number;
  albedo_close_iterator: (iterHandle: number) => number;
  albedo_transform: (
    bucketHandle: number,
    queryPtr: number,
    outIterPtr: number,
  ) => number;
  albedo_transform_data: (iterHandle: number, outDocPtr: number) => number;
  albedo_transform_apply: (iterHandle: number, transformPtr: number) => number;
  albedo_transform_close: (iterHandle: number) => number;
  albedo_transaction_begin: (bucketHandle: number, outTxPtr: number) => number;
  albedo_transaction_insert: (txHandle: number, dataPtr: number) => number;
  albedo_transaction_delete: (
    txHandle: number,
    queryPtr: number,
    queryLen: number,
  ) => number;
  albedo_transaction_update: (
    txHandle: number,
    queryPtr: number,
    queryLen: number,
    programPtr: number,
    programLen: number,
    outUpdatedPtr: number,
  ) => number;
  albedo_transaction_transform: (
    txHandle: number,
    queryPtr: number,
    outIterPtr: number,
  ) => number;
  albedo_transaction_commit: (txHandle: number) => number;
  albedo_transaction_rollback: (txHandle: number) => number;
  albedo_transaction_close: (txHandle: number) => number;
  albedo_subscribe: (
    bucketHandle: number,
    queryPtr: number,
    outHandlePtr: number,
  ) => number;
  albedo_subscribe_poll: (
    handle: number,
    outDocPtr: number,
    maxEvents: number,
  ) => number;
  albedo_subscribe_seqno: (handle: number) => bigint | number;
  albedo_subscribe_close: (handle: number) => number;
  albedo_replication_cursor: (bucketHandle: number, outPtr: number) => number;
  albedo_replication_read: (
    bucketHandle: number,
    fromPtr: number,
    maxBytes: number,
    outBatchPtr: number,
    outSizePtr: number,
  ) => number;
  albedo_replication_apply: (
    bucketHandle: number,
    dataPtr: number,
    dataSize: number,
    outCursorPtr: number,
  ) => number;
  albedo_replication_cursor_close: (cursorHandle: number) => number;
  albedo_version: () => number;
  albedo_bitsize: () => number;
};

let wasmInstance: WebAssembly.Instance | null = null;
let wasmExports: WasmExports | null = null;
let wasmMemory: WebAssembly.Memory | null = null;

function getWasmExports(): WasmExports | null {
  if (wasmExports) return wasmExports;
  if (!wasmInstance) return null;
  wasmExports = wasmInstance.exports as WasmExports;
  wasmMemory = wasmExports.memory;
  return wasmExports;
}

function getMemory(): WebAssembly.Memory | null {
  if (wasmMemory) return wasmMemory;
  const exports = getWasmExports();
  if (!exports) return null;
  wasmMemory = exports.memory;
  return wasmMemory;
}

function getMemoryBuffer(): ArrayBuffer | null {
  const memory = getMemory();
  return memory ? memory.buffer : null;
}

function requireExports(): WasmExports {
  const exports = getWasmExports();
  if (!exports) {
    throw new Error("Albedo WASM exports not ready");
  }
  return exports;
}

function encodeCString(value: string): Uint8Array {
  const stringBytes = encoder.encode(value);
  const withNull = new Uint8Array(stringBytes.length + 1);
  withNull.set(stringBytes);
  withNull[stringBytes.length] = 0;
  return withNull;
}

function writeBytes(ptr: number, bytes: Uint8Array): boolean {
  const buffer = getMemoryBuffer();
  if (!buffer) return false;
  new Uint8Array(buffer, ptr, bytes.length).set(bytes);
  return true;
}

function writeHandleStruct(
  outPtr: number,
  handlePtr: number,
  handleLen: number,
): boolean {
  const buffer = getMemoryBuffer();
  if (!buffer) return false;
  const view = new DataView(buffer);
  view.setUint32(outPtr, handlePtr, true);
  view.setUint32(outPtr + 4, handleLen, true);
  return true;
}

function writeUsize(outPtr: number, value: number): boolean {
  const buffer = getMemoryBuffer();
  if (!buffer) return false;
  const view = new DataView(buffer);
  view.setUint32(outPtr, value, true);
  return true;
}

function writeI64(outPtr: number, value: bigint): boolean {
  const buffer = getMemoryBuffer();
  if (!buffer) return false;
  const view = new DataView(buffer);
  view.setBigInt64(outPtr, value, true);
  return true;
}

function readPtr(ptr: number): number {
  const buffer = getMemoryBuffer();
  if (!buffer) return 0;
  const view = new DataView(buffer);
  return view.getUint32(ptr, true);
}

function mallocZero(size: number): number {
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

function toNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function allocHandleBytes(bytes: Uint8Array): { ptr: number; len: number } {
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

function freeAlloc(ptr: number, len: number): void {
  if (ptr === 0 || len === 0) return;
  const exports = requireExports();
  exports.albedo_free(ptr, len);
}

function copyBsonBytes(ptr: number): Uint8Array {
  const buffer = getMemoryBuffer();
  if (!buffer) {
    throw new Error("WASM memory unavailable");
  }
  const len = new DataView(buffer).getInt32(ptr, true);
  return new Uint8Array(buffer.slice(ptr, ptr + len));
}

function readOwnedBson(ptrPtr: number): Uint8Array {
  const ptr = readPtr(ptrPtr);
  if (ptr === 0) {
    throw new Error("Received null document pointer from WASM module");
  }
  const bytes = copyBsonBytes(ptr);
  freeAlloc(ptr, bytes.length);
  return bytes;
}

const envHelpers: EnvHelpers = {
  getMemoryBuffer,
  writeHandleStruct,
  writeUsize,
  writeI64,
  allocHandleBytes,
  freeAlloc,
  toNumber,
};

const envImports = await resolveEnvImports(envHelpers);

export function getWasmEnvHelpers(): EnvHelpers {
  return envHelpers;
}

export function isWasmReady(): boolean {
  return wasmInstance !== null;
}

export async function compileWasmModule(
  url?: string | URL,
  env?: WebAssembly.ModuleImports,
): Promise<WebAssembly.Module> {
  url = url || wasmUrl;
  const resolvedEnv = (env ?? envImports) as WebAssembly.ModuleImports | null;
  if (!resolvedEnv) {
    throw new Error(
      "Albedo WASM environment imports are not ready. Pass custom env imports (for example OPFS) to compileWasmModule().",
    );
  }
  if (
    typeof WebAssembly.compileStreaming === "function" &&
    typeof fetch === "function"
  ) {
    try {
      wasmModule = await WebAssembly.compileStreaming(fetch(url));
      wasmInstance = await WebAssembly.instantiate(wasmModule, {
        env: resolvedEnv,
      });
      return wasmModule;
    } catch (err) {
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }
  }
  const bytes = await loadWasmBytes(url);
  wasmModule = await WebAssembly.compile(bytes);
  wasmInstance = await WebAssembly.instantiate(wasmModule, {
    env: resolvedEnv,
  });
  return wasmModule;
}

if (!isBrowserEnvironment() && !isDedicatedWorker()) {
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
} as const;

const RESULT_NAMES: Record<number, string> = {
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

function resultName(code: number): string {
  return RESULT_NAMES[code] ?? `code ${code}`;
}

function throwResult(code: number, action: string): never {
  throw new Error(`Failed to ${action} (${resultName(code)})`);
}

export type Path = string;
export type Scalar = string | number | Date | boolean | null | ObjectId;
export type Filter =
  | Scalar
  | { $eq: Scalar }
  | { $gt: Scalar }
  | { $gte: Scalar }
  | { $lt: Scalar }
  | { $lte: Scalar }
  | { $ne: Scalar }
  | { $in: Scalar[] }
  | { $between: [Scalar, Scalar] }
  | { $startsWith: string }
  | { $endsWith: string }
  | { $exists: any }
  | { $notExists: any };

/** @deprecated Use QueryObject. Kept so existing `Query["query"]` annotations still compile. */
export type QueryDoc = QueryObject;

export type ListOptions = {
  sort?: QueryObject["sort"];
  sector?: QueryObject["sector"];
  projection?: QueryObject["projection"];
  cursor?: QueryObject["cursor"];
};

export type IndexOptions = {
  unique?: boolean;
  sparse?: boolean;
  reverse?: boolean;
};

export type IndexInfo = {
  name: string;
  unique: boolean;
  sparse: boolean;
  reverse: boolean;
};

export type WriteDurability =
  | "all"
  | { periodic: number }
  | "manual";

export type ReadDurability = "shared" | "process";

export type OpenBucketOptions = {
  buildIdIndex?: boolean;
  mode?: "ReadOnly" | "ReadWrite" | string;
  auto_vaccuum?: boolean;
  page_cache_capacity?: number;
  wal?: boolean;
  oplog_size?: number;
  write_durability?: WriteDurability;
  read_durability?: ReadDurability;
  wal_auto_checkpoint?: number;
};

export type UpdateFieldRef = `$.${string}`;
export type UpdateNow = "$$now";
export type UpdateOperator =
  | { $plus: [UpdateExpression, UpdateExpression, ...UpdateExpression[]] }
  | { $minus: [UpdateExpression, UpdateExpression, ...UpdateExpression[]] }
  | { $concat: UpdateExpression[] }
  | { $isoDateTime: UpdateExpression };
export type UpdateExpression =
  | UpdateOperator
  | UpdateFieldRef
  | UpdateNow
  | any;
export interface UpdateStage {
  $set?: Record<string, UpdateExpression>;
  $unset?: string | string[];
  [path: string]: UpdateExpression;
}
export type UpdateProgramInput = UpdateStage | UpdateStage[] | Uint8Array;

export type SubscriptionEvent<T = unknown> = {
  seqno: bigint | number;
  op: "insert" | "update" | "delete";
  doc_id: ObjectId;
  ts: bigint | number;
  doc?: T;
};

export type SubscribeOptions = {
  pollingTimeout?: number;
  batchSize?: number;
};

type ByteBuffer = Uint8Array;
type TransformReplacement<T extends object> = T | ByteBuffer | null | undefined;

function convertToQuery(
  query?: QueryInput | QueryClause,
  options?: ListOptions,
): QueryObject {
  let base: QueryObject;
  if (query instanceof Query) {
    base = { ...query.query };
  } else if (query instanceof Uint8Array) {
    base = deserialize(query) as QueryObject;
  } else if (isQueryObject(query)) {
    base = { ...query };
  } else {
    base = { query: (query as QueryClause) ?? {} };
  }
  if (options?.sort) base.sort = options.sort;
  if (options?.sector) base.sector = options.sector;
  if (options?.projection) base.projection = options.projection;
  if (options?.cursor) base.cursor = options.cursor;
  return base;
}

function queryBytes(
  query?: QueryInput | QueryClause,
  options?: ListOptions,
): Uint8Array {
  if (query instanceof Uint8Array && !options) return query;
  const encoded = serialize(convertToQuery(query, options));
  return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}

function documentBytes(doc: object | Uint8Array): Uint8Array {
  if (doc instanceof Uint8Array) return doc;
  const encoded = serialize(doc);
  return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}

function programBytes(program: UpdateProgramInput): Uint8Array {
  if (program instanceof Uint8Array) return program;
  if (Array.isArray(program)) {
    const obj: Record<string, unknown> = {};
    program.forEach((stage, index) => {
      obj[String(index)] = stage;
    });
    return documentBytes(obj);
  }
  return documentBytes(program);
}

function assertU16(len: number, label: string): void {
  if (len > 0xffff) {
    throw new Error(`${label} payload too large for WASM bridge`);
  }
}

function writeDoc(exports: WasmExports, bytes: Uint8Array): number {
  const ptr = exports.albedo_malloc(bytes.length);
  if (ptr === 0) {
    throw new Error("Failed to allocate WASM memory");
  }
  new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
  return ptr;
}

function callUpdate(
  fn: (
    queryPtr: number,
    queryLen: number,
    programPtr: number,
    programLen: number,
    outUpdatedPtr: number,
  ) => number,
  query: QueryInput | QueryClause | undefined,
  program: UpdateProgramInput,
  action: string,
): number {
  const exports = requireExports();
  const qBytes = queryBytes(query);
  const pBytes = programBytes(program);
  assertU16(qBytes.length, "Query");
  assertU16(pBytes.length, "Update program");
  const queryPtr = writeDoc(exports, qBytes);
  const programPtr = writeDoc(exports, pBytes);
  const outPtr = mallocZero(4);
  try {
    const result = fn(
      queryPtr,
      qBytes.length,
      programPtr,
      pBytes.length,
      outPtr,
    );
    if (result !== ResultCode.OK) throwResult(result, action);
    return readPtr(outPtr);
  } finally {
    freeAlloc(queryPtr, qBytes.length);
    freeAlloc(programPtr, pBytes.length);
    freeAlloc(outPtr, 4);
  }
}

function *iterateTransform<T extends object>(
  exports: WasmExports,
  iterHandle: number,
): Generator<T, void, TransformReplacement<T>> {
  const dataPtrPtr = exports.albedo_malloc(4);
  try {
    while (true) {
      const res = exports.albedo_transform_data(iterHandle, dataPtrPtr);
      if (res === ResultCode.EOS) break;
      if (res !== ResultCode.OK) {
        throwResult(res, "read transform iterator");
      }
      const docPtr = readPtr(dataPtrPtr);
      if (docPtr === 0) {
        throw new Error("Received null document pointer from WASM module");
      }
      const currentDoc = deserialize(copyBsonBytes(docPtr)) as T;
      const transformDoc = yield currentDoc;

      let transformPtr = 0;
      let transformLen = 0;
      if (transformDoc === undefined) {
        transformPtr = docPtr;
      } else if (transformDoc === null) {
        transformPtr = 0;
      } else {
        const transformBytes = documentBytes(transformDoc);
        transformLen = transformBytes.length;
        transformPtr = writeDoc(exports, transformBytes);
      }

      try {
        const applyRes = exports.albedo_transform_apply(
          iterHandle,
          transformPtr,
        );
        if (applyRes !== ResultCode.OK) {
          throwResult(applyRes, "apply transformation");
        }
      } finally {
        if (transformDoc !== undefined && transformDoc !== null) {
          exports.albedo_free(transformPtr, transformLen);
        }
      }
    }
  } finally {
    if (iterHandle !== 0) {
      exports.albedo_transform_close(iterHandle);
    }
    exports.albedo_free(dataPtrPtr, 4);
  }
}

function openTransform(
  exports: WasmExports,
  ownerPtr: number,
  query: QueryInput | QueryClause | undefined,
  viaTransaction: boolean,
): number {
  const qBytes = queryBytes(query);
  const queryPtr = writeDoc(exports, qBytes);
  const iterPtrPtr = mallocZero(4);
  try {
    const res = viaTransaction
      ? exports.albedo_transaction_transform(ownerPtr, queryPtr, iterPtrPtr)
      : exports.albedo_transform(ownerPtr, queryPtr, iterPtrPtr);
    if (res !== ResultCode.OK) throwResult(res, "create transform iterator");
    const iterHandle = readPtr(iterPtrPtr);
    if (iterHandle === 0) {
      throw new Error("Received null iterator handle from WASM module");
    }
    return iterHandle;
  } finally {
    freeAlloc(queryPtr, qBytes.length);
    freeAlloc(iterPtrPtr, 4);
  }
}

function aggregateErrors(message: string, errors: unknown[]): Error {
  return new AggregateError(errors, message);
}

export class Transaction {
  exports: WasmExports;

  constructor(private pointer: number) {
    this.exports = requireExports();
  }

  insert(data: object | Uint8Array) {
    const dataBytes = documentBytes(data);
    const dataPtr = writeDoc(this.exports, dataBytes);
    try {
      const result = this.exports.albedo_transaction_insert(
        this.pointer,
        dataPtr,
      );
      if (result !== ResultCode.OK) throwResult(result, "insert in transaction");
    } finally {
      freeAlloc(dataPtr, dataBytes.length);
    }
  }

  delete(query: QueryInput | QueryClause = {}) {
    const qBytes = queryBytes(query);
    assertU16(qBytes.length, "Query");
    const queryPtr = writeDoc(this.exports, qBytes);
    try {
      const result = this.exports.albedo_transaction_delete(
        this.pointer,
        queryPtr,
        qBytes.length,
      );
      if (result !== ResultCode.OK) throwResult(result, "delete in transaction");
    } finally {
      freeAlloc(queryPtr, qBytes.length);
    }
  }

  *transformCursor<T extends object = any>(
    query: QueryInput | QueryClause = {},
  ): Generator<T, void, TransformReplacement<T>> {
    const iterHandle = openTransform(this.exports, this.pointer, query, true);
    yield* iterateTransform<T>(this.exports, iterHandle);
  }

  transformIterator<T extends object = any>(
    query: QueryInput | QueryClause = {},
  ): Generator<T, void, TransformReplacement<T>> {
    return this.transformCursor<T>(query);
  }

  transform<T extends object = any>(
    query: QueryInput | QueryClause | undefined,
    mutator: (doc: T) => TransformReplacement<T>,
  ) {
    const cursor = this.transformCursor<T>(query ?? {});
    let step = cursor.next();
    while (!step.done) {
      step = cursor.next(mutator(step.value));
    }
  }

  update<T extends object = any>(
    query: QueryInput | QueryClause | undefined,
    mutator: (doc: T) => TransformReplacement<T>,
  ) {
    this.transform(query, mutator);
  }

  transfigurate(
    query: QueryInput | QueryClause | undefined,
    program: UpdateProgramInput,
  ): number {
    return callUpdate(
      (queryPtr, queryLen, programPtr, programLen, outUpdatedPtr) =>
        this.exports.albedo_transaction_update(
          this.pointer,
          queryPtr,
          queryLen,
          programPtr,
          programLen,
          outUpdatedPtr,
        ),
      query,
      program,
      "apply update program in transaction",
    );
  }

  commit() {
    const result = this.exports.albedo_transaction_commit(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "commit transaction");
  }

  rollback() {
    const result = this.exports.albedo_transaction_rollback(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "rollback transaction");
  }

  close() {
    const result = this.exports.albedo_transaction_close(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "close transaction");
  }
}

export class Bucket {
  exports: WasmExports;

  constructor(private pointer: number) {
    this.exports = requireExports();
  }

  get memory() {
    return new DataView(this.exports.memory.buffer);
  }

  insert(data: object | Uint8Array) {
    const dataBytes = documentBytes(data);
    const dataPtr = writeDoc(this.exports, dataBytes);
    try {
      const result = this.exports.albedo_insert(this.pointer, dataPtr);
      if (result !== ResultCode.OK) throwResult(result, "insert into Albedo database");
    } finally {
      freeAlloc(dataPtr, dataBytes.length);
    }
  }

  static open(path: string, options?: OpenBucketOptions) {
    const exports = requireExports();
    const dbPtrPtr = mallocZero(4);
    const pathAlloc = allocHandleBytes(encodeCString(path));
    let optionsAlloc: { ptr: number; len: number } | null = null;
    let bucketPtr = 0;
    try {
      let result: number;
      if (options) {
        optionsAlloc = allocHandleBytes(documentBytes(options));
        result = exports.albedo_open_with_options(
          pathAlloc.ptr,
          optionsAlloc.ptr,
          dbPtrPtr,
        );
      } else {
        result = exports.albedo_open(pathAlloc.ptr, dbPtrPtr);
      }
      if (result !== ResultCode.OK) throwResult(result, "open Albedo database");
      bucketPtr = readPtr(dbPtrPtr);
      if (bucketPtr === 0) {
        throw new Error("Received null bucket pointer from WASM module");
      }
    } finally {
      freeAlloc(pathAlloc.ptr, pathAlloc.len);
      if (optionsAlloc) freeAlloc(optionsAlloc.ptr, optionsAlloc.len);
      freeAlloc(dbPtrPtr, 4);
    }
    return new Bucket(bucketPtr);
  }

  close() {
    const result = this.exports.albedo_close(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "close Albedo database");
  }

  vacuum() {
    const result = this.exports.albedo_vacuum(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "vacuum Albedo database");
  }

  checkpoint() {
    const result = this.exports.albedo_checkpoint(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "checkpoint Albedo database");
  }

  flush() {
    const result = this.exports.albedo_flush(this.pointer);
    if (result !== ResultCode.OK) throwResult(result, "flush Albedo database");
  }

  static defaultIndexOptions: IndexOptions = {
    unique: false,
    sparse: false,
    reverse: false,
  };

  ensureIndex(field: string, options = Bucket.defaultIndexOptions) {
    let optionFlags = 0;
    if (options.unique) optionFlags |= 1 << 0;
    if (options.sparse) optionFlags |= 1 << 1;
    if (options.reverse) optionFlags |= 1 << 2;

    const pathAlloc = allocHandleBytes(encodeCString(field));
    try {
      const res = this.exports.albedo_ensure_index(
        this.pointer,
        pathAlloc.ptr,
        optionFlags,
      );
      if (res !== ResultCode.OK) {
        throwResult(res, "create index in Albedo database");
      }
    } finally {
      freeAlloc(pathAlloc.ptr, pathAlloc.len);
    }
  }

  dropIndex(field: string) {
    const pathAlloc = allocHandleBytes(encodeCString(field));
    try {
      const res = this.exports.albedo_drop_index(this.pointer, pathAlloc.ptr);
      if (res === ResultCode.OK) return true;
      if (res === ResultCode.NotFound) return false;
      throwResult(res, "drop index in Albedo database");
    } finally {
      freeAlloc(pathAlloc.ptr, pathAlloc.len);
    }
  }

  listIndexes(): Record<string, IndexInfo> {
    const outPtr = mallocZero(4);
    try {
      const res = this.exports.albedo_list_indexes(this.pointer, outPtr);
      if (res !== ResultCode.OK) throwResult(res, "list indexes");
      const doc = deserialize(readOwnedBson(outPtr)) as {
        indexes?: Record<string, { unique?: boolean; sparse?: boolean; reverse?: boolean }>;
      };
      const indexes = doc.indexes ?? {};
      const mapped: Record<string, IndexInfo> = {};
      for (const [name, options] of Object.entries(indexes)) {
        mapped[name] = {
          name,
          unique: Boolean(options?.unique),
          sparse: Boolean(options?.sparse),
          reverse: Boolean(options?.reverse),
        };
      }
      return mapped;
    } finally {
      freeAlloc(outPtr, 4);
    }
  }

  get indexes() {
    return this.listIndexes();
  }

  delete(
    query: QueryInput | QueryClause = {},
    options: { sector?: QueryObject["sector"] } = {},
  ) {
    const qBytes = queryBytes(query, options);
    assertU16(qBytes.length, "Query");
    const queryPtr = writeDoc(this.exports, qBytes);
    try {
      const result = this.exports.albedo_delete(
        this.pointer,
        queryPtr,
        qBytes.length,
      );
      if (result !== ResultCode.OK) {
        throwResult(result, "delete from Albedo database");
      }
    } finally {
      this.exports.albedo_free(queryPtr, qBytes.length);
    }
  }

  *list<T = any>(
    query: QueryInput | QueryClause = {},
    options: ListOptions = {},
  ): Generator<T, void, boolean | undefined> {
    const qBytes = queryBytes(query, options);
    const queryPtr = writeDoc(this.exports, qBytes);
    const iterPtrPtr = mallocZero(4);
    let iterHandle = 0;
    try {
      const res = this.exports.albedo_list(this.pointer, queryPtr, iterPtrPtr);
      if (res !== ResultCode.OK) throwResult(res, "list Albedo database");
      iterHandle = readPtr(iterPtrPtr);
      if (iterHandle === 0) {
        throw new Error("Received null iterator handle from WASM module");
      }
    } finally {
      this.exports.albedo_free(queryPtr, qBytes.length);
      this.exports.albedo_free(iterPtrPtr, 4);
    }

    const dataPtrPtr = this.exports.albedo_malloc(4);
    try {
      while (true) {
        const res = this.exports.albedo_data(iterHandle, dataPtrPtr);
        if (res === ResultCode.EOS) break;
        if (res !== ResultCode.OK) {
          throwResult(res, "get data from Albedo database");
        }
        const docPtr = readPtr(dataPtrPtr);
        if (docPtr === 0) {
          throw new Error("Received null document pointer from WASM module");
        }
        const shouldQuit = yield deserialize(copyBsonBytes(docPtr)) as T;
        if (shouldQuit) break;
      }
    } finally {
      if (iterHandle !== 0) {
        this.exports.albedo_close_iterator(iterHandle);
      }
      this.exports.albedo_free(dataPtrPtr, 4);
    }
  }

  exportCursor(
    query: QueryInput | QueryClause = {},
    options: ListOptions = {},
  ): Record<string, unknown> {
    const qBytes = queryBytes(query, options);
    const queryPtr = writeDoc(this.exports, qBytes);
    const iterPtrPtr = mallocZero(4);
    let iterHandle = 0;
    try {
      const res = this.exports.albedo_list(this.pointer, queryPtr, iterPtrPtr);
      if (res !== ResultCode.OK) throwResult(res, "list Albedo database");
      iterHandle = readPtr(iterPtrPtr);
      if (iterHandle === 0) {
        throw new Error("Received null iterator handle from WASM module");
      }
    } finally {
      freeAlloc(queryPtr, qBytes.length);
      freeAlloc(iterPtrPtr, 4);
    }

    const outPtr = mallocZero(4);
    try {
      const res = this.exports.albedo_list_cursor_export(iterHandle, outPtr);
      if (res !== ResultCode.OK) throwResult(res, "export list cursor");
      return deserialize(readOwnedBson(outPtr)) as Record<string, unknown>;
    } finally {
      if (iterHandle !== 0) {
        this.exports.albedo_close_iterator(iterHandle);
      }
      freeAlloc(outPtr, 4);
    }
  }

  all<T = any>(
    query: QueryInput | QueryClause = {},
    options: ListOptions = {},
  ): T[] {
    return this.list<T>(query, options).toArray();
  }

  get<T = any>(
    query: QueryInput | QueryClause = {},
    options: ListOptions = {},
  ): T | null {
    const iter = this.list<T>(query, options);
    const result = iter.next(true);
    iter.next(true);
    if (result.done) return null;
    return result.value;
  }

  one<T = any>(
    query: QueryInput | QueryClause = {},
    options: ListOptions = {},
  ): T | null {
    return this.get<T>(query, options);
  }

  *transformCursor<T extends object = any>(
    query: QueryInput | QueryClause = {},
  ): Generator<T, void, TransformReplacement<T>> {
    const iterHandle = openTransform(this.exports, this.pointer, query, false);
    yield* iterateTransform<T>(this.exports, iterHandle);
  }

  transformIterator<T extends object = any>(
    query: QueryInput | QueryClause = {},
  ): Generator<T, void, TransformReplacement<T>> {
    return this.transformCursor<T>(query);
  }

  transform<T extends object = any>(
    query: QueryInput | QueryClause | undefined,
    mutator: (doc: T) => TransformReplacement<T>,
  ) {
    const cursor = this.transformCursor<T>(query ?? {});
    let step = cursor.next();
    while (!step.done) {
      step = cursor.next(mutator(step.value));
    }
  }

  update<T extends object = any>(
    query: QueryInput | QueryClause | undefined,
    mutator: (doc: T) => TransformReplacement<T>,
  ) {
    this.transform(query, mutator);
  }

  transfigurate(
    query: QueryInput | QueryClause | undefined,
    program: UpdateProgramInput,
  ): number {
    return callUpdate(
      (queryPtr, queryLen, programPtr, programLen, outUpdatedPtr) =>
        this.exports.albedo_update(
          this.pointer,
          queryPtr,
          queryLen,
          programPtr,
          programLen,
          outUpdatedPtr,
        ),
      query,
      program,
      "apply update program",
    );
  }

  beginTransaction(): Transaction {
    const outPtr = mallocZero(4);
    try {
      const result = this.exports.albedo_transaction_begin(
        this.pointer,
        outPtr,
      );
      if (result !== ResultCode.OK) throwResult(result, "begin transaction");
      const txPtr = readPtr(outPtr);
      if (txPtr === 0) {
        throw new Error("Received null transaction pointer from WASM module");
      }
      return new Transaction(txPtr);
    } finally {
      freeAlloc(outPtr, 4);
    }
  }

  tx<T>(fn: (tx: Transaction) => T): T {
    const tx = this.beginTransaction();
    let result: T;
    try {
      result = fn(tx);
    } catch (error) {
      try {
        tx.rollback();
      } catch (rollbackError) {
        try {
          tx.close();
        } catch (closeError) {
          throw aggregateErrors(
            "Transaction failed, rollback failed, and close failed",
            [error, rollbackError, closeError],
          );
        }
        throw aggregateErrors("Transaction failed and rollback failed", [
          error,
          rollbackError,
        ]);
      }
      try {
        tx.close();
      } catch (closeError) {
        throw aggregateErrors("Transaction failed and close failed", [
          error,
          closeError,
        ]);
      }
      throw error;
    }

    try {
      tx.commit();
    } catch (commitError) {
      try {
        tx.close();
      } catch (closeError) {
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

  async *subscribe<T = unknown>(
    query: QueryInput | QueryClause = {},
    options?: SubscribeOptions,
  ): AsyncGenerator<SubscriptionEvent<T>> {
    const pollingTimeout = options?.pollingTimeout ?? 50;
    const batchSize = options?.batchSize ?? 64;
    const qBytes = queryBytes(query);
    const queryPtr = writeDoc(this.exports, qBytes);
    const outPtr = mallocZero(4);
    let handle = 0;
    try {
      const res = this.exports.albedo_subscribe(
        this.pointer,
        queryPtr,
        outPtr,
      );
      if (res !== ResultCode.OK) throwResult(res, "subscribe to Albedo changes");
      handle = readPtr(outPtr);
      if (handle === 0) {
        throw new Error("Received null subscription handle from WASM module");
      }
    } finally {
      freeAlloc(queryPtr, qBytes.length);
      freeAlloc(outPtr, 4);
    }

    const docPtrPtr = mallocZero(4);
    try {
      while (true) {
        const res = this.exports.albedo_subscribe_poll(
          handle,
          docPtrPtr,
          batchSize,
        );
        if (res === ResultCode.HasData) {
          const docPtr = readPtr(docPtrPtr);
          const batch = deserialize(copyBsonBytes(docPtr)) as {
            batch?: SubscriptionEvent<T>[];
          };
          for (const event of batch.batch ?? []) {
            yield event;
          }
        } else if (res === ResultCode.EOS) {
          await new Promise((resolve) => setTimeout(resolve, pollingTimeout));
        } else {
          throwResult(res, "poll subscription");
        }
      }
    } finally {
      this.exports.albedo_subscribe_close(handle);
      freeAlloc(docPtrPtr, 4);
    }
  }

  static convertToQuery(
    query?: QueryInput | QueryClause,
    options?: ListOptions,
  ): QueryObject {
    return convertToQuery(query, options);
  }
}

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
