# Albedo OPFS todo example

A React todo app that stores documents in an Albedo bucket backed by the
[Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).

WASM file I/O is synchronous, and `FileSystemSyncAccessHandle` is Worker-only, so the bucket lives in `src/albedo.worker.ts`. The UI talks to that worker over `postMessage`.

```ts
import { Bucket } from "albedo-wasm/opfs";
import wasmUrl from "albedo-wasm/albedo.wasm?url";

const bucket = await Bucket.open("todos.bucket", { wasmUrl });
```

`albedo-wasm` keeps a sync `Bucket.open` for Node and localStorage. OPFS setup (access handles, vacuum temp file, wasm env) stays behind the `/opfs` entry.

## Run

```bash
bun install
bun run dev
```

Requires a browser that supports OPFS sync access handles in dedicated workers (Chromium or Safari 16.4+).

## Tests

CRUD coverage uses [Bun.WebView](https://bun.com/docs/runtime/webview) (Bun 1.3.12+, Chrome/Chromium installed):

```bash
bun test
```

The suite builds the Vite app, serves it, then drives create / update / toggle / delete and a reload persistence check against OPFS.
