type BSONValue = any;
export type FilterOperators = {
    $eq: BSONValue;
} | BSONValue | {
    $ne: BSONValue;
} | {
    $lt: BSONValue;
} | {
    $lte: BSONValue;
} | {
    $gt: BSONValue;
} | {
    $gte: BSONValue;
} | {
    $in: BSONValue[];
} | {
    $between: [BSONValue, BSONValue];
} | {
    $startsWith: string;
} | {
    $endsWith: string;
} | {
    $exists: boolean;
} | {
    $notExists: boolean;
};
export interface QueryClause {
    $or?: QueryClause[];
    $and?: QueryClause[];
    $nor?: QueryClause[];
    [field: string]: FilterOperators | QueryClause[] | undefined;
}
export type QuerySort = {
    asc: string;
} | {
    desc: string;
};
export interface QuerySector {
    offset?: number;
    limit?: number;
}
export interface QueryObject {
    query?: QueryClause;
    sort?: QuerySort;
    sector?: QuerySector;
    projection?: {
        omit: string[];
    } | {
        pick: string[];
    };
    cursor?: Record<string, unknown>;
}
export type QueryInput = QueryObject | Query | QueryClause | Uint8Array;
export type QueryClauseInput = QueryClause | Query;
export declare function isQueryObject(value: unknown): value is QueryObject;
/**
 * Builder for query objects used with bucket operations like `list`,
 * `delete`, and `transform`.
 */
export declare class Query {
    private _query;
    static or(...clauses: QueryClauseInput[]): Query;
    static and(...clauses: QueryClauseInput[]): Query;
    static nor(...clauses: QueryClauseInput[]): Query;
    get query(): QueryObject;
    where(field: string, filter: FilterOperators): this;
    or(...clauses: QueryClauseInput[]): this;
    and(...clauses: QueryClauseInput[]): this;
    nor(...clauses: QueryClauseInput[]): this;
    sortBy(field: string, direction?: "asc" | "desc"): this;
    sector(offset?: number, limit?: number): this;
    pick(...fields: string[]): this;
    omit(...fields: string[]): this;
    cursor(cursor: Record<string, unknown>): this;
    private addLogicalClause;
}
export declare function where(field: string, filter: FilterOperators): Query;
export {};
//# sourceMappingURL=query.d.ts.map