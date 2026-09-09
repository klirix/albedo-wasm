import { type ObjectId } from "./bson";
import { Query, type QueryClause, type QueryInput, type QueryObject } from "./query";
export * from "./bson";
export * from "./query";
type WasmExports = WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    albedo_malloc: (size: number) => number;
    albedo_free: (ptr: number, size: number) => void;
    albedo_open: (pathPtr: number, bucketOutPtr: number) => number;
    albedo_open_with_options: (pathPtr: number, optionsPtr: number, bucketOutPtr: number) => number;
    albedo_close: (bucketHandle: number) => number;
    albedo_insert: (bucketHandle: number, dataPtr: number) => number;
    albedo_vacuum: (bucketHandle: number) => number;
    albedo_checkpoint: (bucketHandle: number) => number;
    albedo_flush: (bucketHandle: number) => number;
    albedo_ensure_index: (bucketHandle: number, pathPtr: number, optionsByte: number) => number;
    albedo_drop_index: (bucketHandle: number, pathPtr: number) => number;
    albedo_list_indexes: (bucketHandle: number, outDocPtr: number) => number;
    albedo_delete: (bucketHandle: number, queryPtr: number, queryLen: number) => number;
    albedo_update: (bucketHandle: number, queryPtr: number, queryLen: number, programPtr: number, programLen: number, outUpdatedPtr: number) => number;
    albedo_list: (bucketHandle: number, queryPtr: number, outIterPtr: number) => number;
    albedo_data: (iterHandle: number, outDocPtr: number) => number;
    albedo_list_cursor_export: (iterHandle: number, outCursorPtr: number) => number;
    albedo_close_iterator: (iterHandle: number) => number;
    albedo_transform: (bucketHandle: number, queryPtr: number, outIterPtr: number) => number;
    albedo_transform_data: (iterHandle: number, outDocPtr: number) => number;
    albedo_transform_apply: (iterHandle: number, transformPtr: number) => number;
    albedo_transform_close: (iterHandle: number) => number;
    albedo_transaction_begin: (bucketHandle: number, outTxPtr: number) => number;
    albedo_transaction_insert: (txHandle: number, dataPtr: number) => number;
    albedo_transaction_delete: (txHandle: number, queryPtr: number, queryLen: number) => number;
    albedo_transaction_update: (txHandle: number, queryPtr: number, queryLen: number, programPtr: number, programLen: number, outUpdatedPtr: number) => number;
    albedo_transaction_transform: (txHandle: number, queryPtr: number, outIterPtr: number) => number;
    albedo_transaction_commit: (txHandle: number) => number;
    albedo_transaction_rollback: (txHandle: number) => number;
    albedo_transaction_close: (txHandle: number) => number;
    albedo_subscribe: (bucketHandle: number, queryPtr: number, outHandlePtr: number) => number;
    albedo_subscribe_poll: (handle: number, outDocPtr: number, maxEvents: number) => number;
    albedo_subscribe_seqno: (handle: number) => bigint | number;
    albedo_subscribe_close: (handle: number) => number;
    albedo_replication_cursor: (bucketHandle: number, outPtr: number) => number;
    albedo_replication_read: (bucketHandle: number, fromPtr: number, maxBytes: number, outBatchPtr: number, outSizePtr: number) => number;
    albedo_replication_apply: (bucketHandle: number, dataPtr: number, dataSize: number, outCursorPtr: number) => number;
    albedo_replication_cursor_close: (cursorHandle: number) => number;
    albedo_version: () => number;
    albedo_bitsize: () => number;
};
declare let wasmInstance: WebAssembly.Instance | null;
export declare function compileWasmModule(url?: string | URL): Promise<WebAssembly.Module>;
export { wasmInstance };
export type Path = string;
export type Scalar = string | number | Date | boolean | null | ObjectId;
export type Filter = Scalar | {
    $eq: Scalar;
} | {
    $gt: Scalar;
} | {
    $gte: Scalar;
} | {
    $lt: Scalar;
} | {
    $lte: Scalar;
} | {
    $ne: Scalar;
} | {
    $in: Scalar[];
} | {
    $between: [Scalar, Scalar];
} | {
    $startsWith: string;
} | {
    $endsWith: string;
} | {
    $exists: any;
} | {
    $notExists: any;
};
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
export type WriteDurability = "all" | {
    periodic: number;
} | "manual";
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
export type UpdateOperator = {
    $plus: [UpdateExpression, UpdateExpression, ...UpdateExpression[]];
} | {
    $minus: [UpdateExpression, UpdateExpression, ...UpdateExpression[]];
} | {
    $concat: UpdateExpression[];
} | {
    $isoDateTime: UpdateExpression;
};
export type UpdateExpression = UpdateOperator | UpdateFieldRef | UpdateNow | any;
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
export declare class Transaction {
    private pointer;
    exports: WasmExports;
    constructor(pointer: number);
    insert(data: object | Uint8Array): void;
    delete(query?: QueryInput | QueryClause): void;
    transformCursor<T extends object = any>(query?: QueryInput | QueryClause): Generator<T, void, TransformReplacement<T>>;
    transformIterator<T extends object = any>(query?: QueryInput | QueryClause): Generator<T, void, TransformReplacement<T>>;
    transform<T extends object = any>(query: QueryInput | QueryClause | undefined, mutator: (doc: T) => TransformReplacement<T>): void;
    update<T extends object = any>(query: QueryInput | QueryClause | undefined, mutator: (doc: T) => TransformReplacement<T>): void;
    transfigurate(query: QueryInput | QueryClause | undefined, program: UpdateProgramInput): number;
    commit(): void;
    rollback(): void;
    close(): void;
}
export declare class Bucket {
    private pointer;
    exports: WasmExports;
    constructor(pointer: number);
    get memory(): DataView<ArrayBuffer>;
    insert(data: object | Uint8Array): void;
    static open(path: string, options?: OpenBucketOptions): Bucket;
    close(): void;
    vacuum(): void;
    checkpoint(): void;
    flush(): void;
    static defaultIndexOptions: IndexOptions;
    ensureIndex(field: string, options?: IndexOptions): void;
    dropIndex(field: string): boolean;
    listIndexes(): Record<string, IndexInfo>;
    get indexes(): Record<string, IndexInfo>;
    delete(query?: QueryInput | QueryClause, options?: {
        sector?: QueryObject["sector"];
    }): void;
    list<T = any>(query?: QueryInput | QueryClause, options?: ListOptions): Generator<T, void, boolean | undefined>;
    exportCursor(query?: QueryInput | QueryClause, options?: ListOptions): Record<string, unknown>;
    all<T = any>(query?: QueryInput | QueryClause, options?: ListOptions): T[];
    get<T = any>(query?: QueryInput | QueryClause, options?: ListOptions): T | null;
    one<T = any>(query?: QueryInput | QueryClause, options?: ListOptions): T | null;
    transformCursor<T extends object = any>(query?: QueryInput | QueryClause): Generator<T, void, TransformReplacement<T>>;
    transformIterator<T extends object = any>(query?: QueryInput | QueryClause): Generator<T, void, TransformReplacement<T>>;
    transform<T extends object = any>(query: QueryInput | QueryClause | undefined, mutator: (doc: T) => TransformReplacement<T>): void;
    update<T extends object = any>(query: QueryInput | QueryClause | undefined, mutator: (doc: T) => TransformReplacement<T>): void;
    transfigurate(query: QueryInput | QueryClause | undefined, program: UpdateProgramInput): number;
    beginTransaction(): Transaction;
    tx<T>(fn: (tx: Transaction) => T): T;
    subscribe<T = unknown>(query?: QueryInput | QueryClause, options?: SubscribeOptions): AsyncGenerator<SubscriptionEvent<T>>;
    static convertToQuery(query?: QueryInput | QueryClause, options?: ListOptions): QueryObject;
}
declare const _default: {
    Bucket: typeof Bucket;
    Transaction: typeof Transaction;
    Query: typeof Query;
    version(): number;
    bitsize(): number;
};
export default _default;
//# sourceMappingURL=albedo-wasm.d.ts.map