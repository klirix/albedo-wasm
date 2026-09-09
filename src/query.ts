type BSONValue = any;

export type FilterOperators =
  | { $eq: BSONValue }
  | BSONValue
  | { $ne: BSONValue }
  | { $lt: BSONValue }
  | { $lte: BSONValue }
  | { $gt: BSONValue }
  | { $gte: BSONValue }
  | { $in: BSONValue[] }
  | { $between: [BSONValue, BSONValue] }
  | { $startsWith: string }
  | { $endsWith: string }
  | { $exists: boolean }
  | { $notExists: boolean };

export interface QueryClause {
  $or?: QueryClause[];
  $and?: QueryClause[];
  $nor?: QueryClause[];
  [field: string]: FilterOperators | QueryClause[] | undefined;
}

export type QuerySort = { asc: string } | { desc: string };

export interface QuerySector {
  offset?: number;
  limit?: number;
}

export interface QueryObject {
  query?: QueryClause;
  sort?: QuerySort;
  sector?: QuerySector;
  projection?: { omit: string[] } | { pick: string[] };
  cursor?: Record<string, unknown>;
}

export type QueryInput = QueryObject | Query | QueryClause | Uint8Array;
export type QueryClauseInput = QueryClause | Query;

const QUERY_OBJECT_KEYS = new Set([
  "query",
  "sort",
  "sector",
  "projection",
  "cursor",
]);

function isQuery(value: unknown): value is Query {
  return value instanceof Query;
}

function toClause(value: QueryClauseInput): QueryClause {
  if (isQuery(value)) {
    return value.query.query ?? {};
  }
  return value;
}

export function isQueryObject(value: unknown): value is QueryObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  if (isQuery(value)) return true;
  const keys = Object.keys(value as object);
  return keys.length > 0 && keys.every((key) => QUERY_OBJECT_KEYS.has(key));
}

/**
 * Builder for query objects used with bucket operations like `list`,
 * `delete`, and `transform`.
 */
export class Query {
  private _query: QueryObject = {};

  static or(...clauses: QueryClauseInput[]): Query {
    return new Query().or(...clauses);
  }

  static and(...clauses: QueryClauseInput[]): Query {
    return new Query().and(...clauses);
  }

  static nor(...clauses: QueryClauseInput[]): Query {
    return new Query().nor(...clauses);
  }

  get query(): QueryObject {
    return this._query;
  }

  where(field: string, filter: FilterOperators): this {
    if (!this._query.query) {
      this._query.query = {};
    }
    this._query.query[field] = filter;
    return this;
  }

  or(...clauses: QueryClauseInput[]): this {
    return this.addLogicalClause("$or", clauses);
  }

  and(...clauses: QueryClauseInput[]): this {
    return this.addLogicalClause("$and", clauses);
  }

  nor(...clauses: QueryClauseInput[]): this {
    return this.addLogicalClause("$nor", clauses);
  }

  sortBy(field: string, direction: "asc" | "desc" = "asc"): this {
    this._query.sort = direction === "asc" ? { asc: field } : { desc: field };
    return this;
  }

  sector(offset?: number, limit?: number): this {
    this._query.sector = { offset, limit };
    return this;
  }

  pick(...fields: string[]): this {
    this._query.projection = { pick: fields };
    return this;
  }

  omit(...fields: string[]): this {
    this._query.projection = { omit: fields };
    return this;
  }

  cursor(cursor: Record<string, unknown>): this {
    this._query.cursor = cursor;
    return this;
  }

  private addLogicalClause(
    operator: "$or" | "$and" | "$nor",
    clauses: QueryClauseInput[],
  ): this {
    if (!this._query.query) {
      this._query.query = {};
    }
    this._query.query[operator] = clauses.map(toClause);
    return this;
  }
}

export function where(field: string, filter: FilterOperators): Query {
  return new Query().where(field, filter);
}
