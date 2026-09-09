const QUERY_OBJECT_KEYS = new Set([
    "query",
    "sort",
    "sector",
    "projection",
    "cursor",
]);
function isQuery(value) {
    return value instanceof Query;
}
function toClause(value) {
    if (isQuery(value)) {
        return value.query.query ?? {};
    }
    return value;
}
export function isQueryObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    if (isQuery(value))
        return true;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => QUERY_OBJECT_KEYS.has(key));
}
/**
 * Builder for query objects used with bucket operations like `list`,
 * `delete`, and `transform`.
 */
export class Query {
    constructor() {
        this._query = {};
    }
    static or(...clauses) {
        return new Query().or(...clauses);
    }
    static and(...clauses) {
        return new Query().and(...clauses);
    }
    static nor(...clauses) {
        return new Query().nor(...clauses);
    }
    get query() {
        return this._query;
    }
    where(field, filter) {
        if (!this._query.query) {
            this._query.query = {};
        }
        this._query.query[field] = filter;
        return this;
    }
    or(...clauses) {
        return this.addLogicalClause("$or", clauses);
    }
    and(...clauses) {
        return this.addLogicalClause("$and", clauses);
    }
    nor(...clauses) {
        return this.addLogicalClause("$nor", clauses);
    }
    sortBy(field, direction = "asc") {
        this._query.sort = direction === "asc" ? { asc: field } : { desc: field };
        return this;
    }
    sector(offset, limit) {
        this._query.sector = { offset, limit };
        return this;
    }
    pick(...fields) {
        this._query.projection = { pick: fields };
        return this;
    }
    omit(...fields) {
        this._query.projection = { omit: fields };
        return this;
    }
    cursor(cursor) {
        this._query.cursor = cursor;
        return this;
    }
    addLogicalClause(operator, clauses) {
        if (!this._query.query) {
            this._query.query = {};
        }
        this._query.query[operator] = clauses.map(toClause);
        return this;
    }
}
export function where(field, filter) {
    return new Query().where(field, filter);
}
//# sourceMappingURL=query.js.map