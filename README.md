# albedo-wasm

WebAssembly bindings for the [Albedo](../README.md) embedded document store. The package provides a small TypeScript-first API that works in Bun/Node.js and browsers while sharing the exact same storage format.

## Requirements

- Node.js ≥ 18, Bun ≥ 1.0, or any browser
- Optionally tooling that can serve/copy `.wasm` assets referenced as `new URL("./albedo.wasm", import.meta.url)` (Vite, Bun, Webpack, esbuild, and most bundlers already handle this).

## Installation

```bash
npm install albedo-wasm        # or pnpm add / yarn add
bun add albedo-wasm
```

### Choosing a distribution

| Variant                   | How to import                                  | When to use                                                                                                                                |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `dist/index.js` (default) | `import { Bucket } from "albedo-wasm";`        | Prefer this for almost everything. WASM sits next to the JS bundle allowing browsers to stream-compile it and CDNs to cache it separately. |
| Inline bundle             | `import { Bucket } from "albedo-wasm/inline";` | Only when you absolutely need a single-file payload (e.g. embedding into sandboxed runtimes that cannot fetch sibling files).              |

When targeting browsers, make sure your bundler copies `albedo.wasm` to your public assets folder. Example for Vite:

```ts
// vite.config.ts
export default defineConfig({
  assetsInclude: ["**/*.wasm"],
});
```

## Quick start (Node.js / Bun)

```ts
import { Bucket } from "albedo-wasm";

// Buckets map to files. Relative paths resolve from process.cwd().
const bucket = Bucket.open("./data/tasks.bucket");

bucket.ensureIndex("meta.created_at", { sparse: true });

bucket.insert({
  _id: crypto.randomUUID(),
  title: "Ship WASM bindings",
  status: "open",
  meta: { created_at: new Date().toISOString(), priority: 1 },
});

const openTasks = bucket.all(
  { status: "open" },
  {
    sort: { asc: "meta.priority" },
    // projection: { pick: ["title", "status", "meta.priority"] },
  }
);

bucket.transform({ status: "open" }, (doc) => ({
  ...doc,
  status: doc.meta.priority > 1 ? "blocked" : "in-progress",
}));

bucket.delete({ status: "done" });
bucket.vacuum();
bucket.close();
```

> Bun users do not need any special configuration—the loader automatically uses Bun's fast file APIs.

## Quick start (browser / Localstorage)

In the browser the bucket file lives inside Localstorage.

```ts
import { Bucket, compileWasmModule } from "albedo-wasm";
import wasm from "albedo-wasm/albedo.wasm?url";

async function initBucket() {
  await compileWasmModule(wasm); // can skip with inline

  const bucket = Bucket.open("notes/app.bucket");

  // Seed data on first run
  if (!bucket.get({ "meta.slug": "welcome" })) {
    bucket.insert({
      title: "Welcome",
      content: "Stored entirely inside Localstorage!",
      meta: { slug: "welcome", created_at: Date.now() },
    });
  }

  const latest = Array.from(
    bucket.list(
      {},
      {
        sector: { limit: 50 },
        sort: { desc: "meta.created_at" },
      }
    )
  );

  return { bucket, latest };
}

const { bucket, latest } = await initBucket();
console.log("Rendered notes", latest);
```

The module uses top-level `await`, so make sure your bundler targets environments that support it (all evergreen browsers and ESM-only Node.js/Bun entry points do).

## Query & index basics

Albedo reuses familiar document-store concepts:

```ts
type QueryObject = {
  query?: QueryClause;
  sort?: { asc: string } | { desc: string };
  sector?: { offset?: number; limit?: number };
  projection?: { pick?: string[] } | { omit?: string[] };
  cursor?: Record<string, unknown>;
};

type QueryClause = {
  $or?: QueryClause[];
  $and?: QueryClause[];
  $nor?: QueryClause[];
  [field: string]: Filter | QueryClause[] | undefined;
};

type Filter =
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
```

Logical groups can be mixed with field filters:

```ts
bucket.all({
  query: {
    $or: [{ role: "admin" }, { public: true }],
    deleted: false,
  },
});
```

The fluent `Query` builder and `where()` helper produce the same documents:

```ts
import { Bucket, Query, where } from "albedo-wasm";

const visible = Query.or(
  where("role", "admin"),
  Query.and(where("role", "user"), where("verified", true)),
).nor(where("deleted", true));

for (const doc of bucket.list(visible)) {
  console.log(doc);
}
```

`list`, `all`, `get`, `delete`, and `transform` still accept a flat filter map (`{ status: "open" }`) for compatibility.

Use dotted paths (`"meta.created_at"`) for nested fields and call `bucket.ensureIndex(path, options)` before running heavy queries. Index options:

```ts
bucket.ensureIndex("meta.slug", {
  unique: true,
  sparse: false,
  reverse: false,
});
```

## API highlights

- `Bucket.open(path, options?)` → opens (or creates) a bucket file. Call `bucket.close()` when shutting down.
- `bucket.insert(doc)` → inserts any BSON-serializable document or pre-serialized `Uint8Array`.
- `bucket.ensureIndex(path, options)` / `bucket.dropIndex(path)` / `bucket.indexes` → manage indexes.
- `bucket.list(query?, options?)` → generator that yields matching documents; integrate with `for...of`, `Array.from`, or break early by returning `true` from the iterator.
- `bucket.all(query?, options?)` → convenience wrapper that collects `list`.
- `bucket.get(query, options?)` / `bucket.one(query, options?)` → returns the first matching document or `null`.
- `bucket.delete(query)` → removes matching documents.
- `bucket.transform(query, mutator)` → streaming mutate/replace/delete. Return a new document to replace, `null` to delete, or `undefined` to leave the doc untouched.
- `bucket.transfigurate(query, program)` → applies a native update program (`$set`, `$unset`, `$plus`, `$concat`, `$$now`, pipelines) and returns the match count.
- `bucket.tx(fn)` / `bucket.beginTransaction()` → groups inserts, deletes, transforms, and transfigurate calls under commit/rollback.
- `bucket.checkpoint()` / `bucket.flush()` / `bucket.vacuum()` → maintenance. WAL is currently forced off for the WASM target, so checkpoint/flush are no-ops besides the C ABI call.
- `Query`, `where()`, `Bucket.defaultIndexOptions`, and `version()` are also exported.

### Native update programs

```ts
bucket.transfigurate(where("name", "stark"), {
  $set: {
    age: { $plus: ["$.age", 1] },
    seenAt: "$$now",
  },
  $unset: "marriage",
});

bucket.transfigurate(undefined, [
  { $set: { fullName: { $concat: ["$.first", " ", "$.last"] } } },
  { $unset: ["first", "last"] },
]);
```

Subscriptions and WAL replication exist in the Albedo C ABI, but WAL mode is currently disabled for `wasm32-freestanding`, so those APIs are not useful in this package yet.

TypeScript declarations live in `dist/index.d.ts`, so editors receive full completions automatically.

## Local development

Bun is required for dev

```bash
# Install JS dependencies
bun install

# Rebuild albedo.wasm from the submodule (Zig 0.16 required)
bun run build-core

# Build the standard JS + WASM pair
bun run build

# Build single-file inline distribution
bun run build:inline

# Run the Bun-based unit tests
bun test
```

---

Need help or have questions? Open an issue in the main repository and mention the `albedo-wasm` package. Happy hacking!
