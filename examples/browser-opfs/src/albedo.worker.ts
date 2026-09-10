/// <reference lib="webworker" />

import { Bucket, ObjectId, closeOpfs } from "albedo-wasm/opfs";
import wasmUrl from "albedo-wasm/albedo.wasm?url";
import type { Todo, WorkerRequest, WorkerResponse } from "./types";

const BUCKET_PATH = "todos.bucket";

let bucket: Bucket | null = null;

function reply(id: number, result?: unknown): void {
  const message: WorkerResponse = { id, ok: true, result };
  self.postMessage(message);
}

function fail(id: number, error: unknown): void {
  const message: WorkerResponse = {
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  self.postMessage(message);
}

function requireBucket(): Bucket {
  if (!bucket) {
    throw new Error("OPFS bucket is not initialized");
  }
  return bucket;
}

function listTodos(): Todo[] {
  return requireBucket().all<Todo>({}, { sort: { desc: "createdAt" } });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  try {
    switch (type) {
      case "init": {
        bucket = await Bucket.open(BUCKET_PATH, { wasmUrl });
        reply(id, { ready: true, backend: "opfs" });
        break;
      }
      case "list": {
        reply(id, listTodos());
        break;
      }
      case "insert": {
        const title = String(payload ?? "").trim();
        if (!title) throw new Error("Title is required");
        const todo: Todo = {
          _id: new ObjectId().toString(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        requireBucket().insert(todo);
        requireBucket().flush();
        reply(id, listTodos());
        break;
      }
      case "toggle": {
        const idToToggle = String(payload);
        requireBucket().transform({ _id: idToToggle }, (doc: Todo) => ({
          ...doc,
          completed: !doc.completed,
        }));
        requireBucket().flush();
        reply(id, listTodos());
        break;
      }
      case "updateTitle": {
        const body = payload as { id: string; title: string };
        const title = String(body.title ?? "").trim();
        if (!title) throw new Error("Title is required");
        requireBucket().transform({ _id: body.id }, (doc: Todo) => ({
          ...doc,
          title,
        }));
        requireBucket().flush();
        reply(id, listTodos());
        break;
      }
      case "remove": {
        requireBucket().delete({ _id: String(payload) });
        requireBucket().flush();
        reply(id, listTodos());
        break;
      }
      case "close": {
        if (bucket) {
          bucket.flush();
          bucket.close();
          bucket = null;
        }
        await closeOpfs();
        reply(id, { closed: true });
        break;
      }
      default:
        throw new Error(`Unknown worker message: ${type}`);
    }
  } catch (error) {
    fail(id, error);
  }
};
