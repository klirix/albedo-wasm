declare const customInspectSymbol: unique symbol;
export declare class ObjectId {
    readonly id: Uint8Array;
    constructor(input?: Uint8Array | ArrayLike<number> | string);
    static fromString(hex: string): ObjectId;
    toString(): string;
    [customInspectSymbol](depth?: number, options?: unknown, inspect?: (x: unknown, options?: unknown) => string): string;
}
export declare function defaultInspect(x: unknown, _options?: unknown): string;
export declare function serialize(obj: any): Uint8Array;
export declare function deserialize(buf: ArrayBuffer | Uint8Array | DataView): any;
export {};
//# sourceMappingURL=bson.d.ts.map