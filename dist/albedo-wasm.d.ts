import { type ObjectId } from "./bson";
export * from "./bson";
type WasmExports = WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    albedo_malloc: (size: number) => number;
    albedo_free: (ptr: number, size: number) => void;
    albedo_open: (pathPtr: number, bucketOutPtr: number) => number;
    albedo_close: (bucketHandle: number) => number;
    albedo_insert: (bucketHandle: number, dataPtr: number) => number;
    albedo_vacuum: (bucketHandle: number) => number;
    albedo_ensure_index: (bucketHandle: number, pathPtr: number, optionsByte: number) => number;
    albedo_drop_index: (bucketHandle: number, pathPtr: number) => number;
    albedo_delete: (bucketHandle: number, queryPtr: number, queryLen: number) => number;
    albedo_list: (bucketHandle: number, queryPtr: number, outIterPtr: number) => number;
    albedo_data: (iterHandle: number, outDocPtr: number) => number;
    albedo_close_iterator: (iterHandle: number) => number;
    albedo_transform: (bucketHandle: number, queryPtr: number, outIterPtr: number) => number;
    albedo_transform_data: (iterHandle: number, outDocPtr: number) => number;
    albedo_transform_apply: (iterHandle: number, transformPtr: number) => number;
    albedo_transform_close: (iterHandle: number) => number;
    albedo_version: () => number;
};
declare let wasmInstance: WebAssembly.Instance | null;
export declare function compileWasmModule(url?: string | URL): Promise<WebAssembly.Module>;
export { wasmInstance };
type Path = string;
type Scalar = string | number | Date | boolean | null | ObjectId;
type Filter = Scalar | {
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
export type Query = {
    query?: Record<Path, Filter>;
    sort?: {
        asc: Path;
    } | {
        desc: Path;
    };
    sector?: {
        offset?: number;
        limit?: number;
    };
    projection?: {
        omit?: Path[];
    } | {
        pick?: Path[];
    };
};
export declare class Bucket {
    private pointer;
    exports: WasmExports;
    constructor(pointer: number);
    get memory(): DataView<ArrayBuffer>;
    insert(data: any): void;
    static open(path: string): Bucket;
    close(): void;
    vacuum(): void;
    static defaultIndexOptions: {
        unique: boolean;
        sparse: boolean;
        reverse: boolean;
    };
    ensureIndex(field: string, options?: {
        unique: boolean;
        sparse: boolean;
        reverse: boolean;
    }): void;
    dropIndex(field: string): boolean;
    delete(query: Query["query"], _options?: {
        sector?: Query["sector"];
    }): void;
    list(query?: Query["query"], options?: {
        sort?: Query["sort"];
        sector?: Query["sector"];
        projection?: Query["projection"];
    }): Generator<any, void, boolean | undefined>;
    all(query?: Query["query"], options?: Query): any[];
    get(query: Query["query"], options?: Query): any;
    transformCursor(query?: Query["query"]): Generator<any, void, any | null | undefined>;
    transform(query: Query["query"], mutator: (doc: any) => any | null | undefined): void;
}
declare const _default: {
    Bucket: typeof Bucket;
    version(): number;
};
export default _default;
//# sourceMappingURL=albedo-wasm.d.ts.map