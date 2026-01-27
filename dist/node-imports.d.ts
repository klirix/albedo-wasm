export type NodeEnvHelpers = {
    getMemoryBuffer: () => ArrayBuffer | null;
    writeHandleStruct: (outPtr: number, handlePtr: number, handleLen: number) => boolean;
    writeUsize: (outPtr: number, value: number) => boolean;
    writeI64: (outPtr: number, value: bigint) => boolean;
    allocHandleBytes: (bytes: Uint8Array) => {
        ptr: number;
        len: number;
    };
    freeAlloc: (ptr: number, len: number) => void;
    toNumber: (value: number | bigint) => number;
};
export declare function createNodeEnvImports(helpers: NodeEnvHelpers): {
    wasm_open_file(pathPtr: number, pathLen: number, readFlag: number, writeFlag: number, createFlag: number, truncateFlag: number, outHandlePtr: number): number;
    wasm_close_file(handlePtr: number, handleLen: number): number;
    wasm_pread(handlePtr: number, handleLen: number, offset: number | bigint, destPtr: number, destLen: number, outReadPtr: number): number;
    wasm_pwrite(handlePtr: number, handleLen: number, offset: number | bigint, srcPtr: number, srcLen: number, outWrittenPtr: number): number;
    wasm_sync(handlePtr: number, handleLen: number): number;
    wasm_delete_file(pathPtr: number, pathLen: number): number;
    wasm_rename_file(oldPtr: number, oldLen: number, newPtr: number, newLen: number): number;
    wasm_random_bytes(destPtr: number, destLen: number): number;
    wasm_now_seconds(outPtr: number): number;
    wasm_log(msgPtr: number, msgLen: number): void;
};
export type NodeEnvImports = ReturnType<typeof createNodeEnvImports>;
//# sourceMappingURL=node-imports.d.ts.map