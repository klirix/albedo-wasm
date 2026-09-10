import AlbedoWorker from "./albedo.worker.ts?worker";
import type { Todo, WorkerRequest, WorkerResponse } from "./types";

const worker = new AlbedoWorker();

let nextId = 1;

function rpc<T>(type: WorkerRequest["type"], payload?: unknown): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      if (!event.data.ok) {
        reject(new Error(event.data.error ?? "Worker request failed"));
        return;
      }
      resolve(event.data.result as T);
    };
    worker.addEventListener("message", onMessage);
    const request: WorkerRequest = { id, type, payload };
    worker.postMessage(request);
  });
}

export async function initDb(): Promise<void> {
  await rpc("init");
}

export function listTodos(): Promise<Todo[]> {
  return rpc("list");
}

export function insertTodo(title: string): Promise<Todo[]> {
  return rpc("insert", title);
}

export function toggleTodo(id: string): Promise<Todo[]> {
  return rpc("toggle", id);
}

export function updateTodoTitle(id: string, title: string): Promise<Todo[]> {
  return rpc("updateTitle", { id, title });
}

export function removeTodo(id: string): Promise<Todo[]> {
  return rpc("remove", id);
}

export function closeDb(): Promise<void> {
  return rpc("close");
}

if (typeof window !== "undefined") {
  Object.assign(window, {
    __listTodos: listTodos,
    __removeTodo: removeTodo,
    __insertTodo: insertTodo,
    __closeDb: closeDb,
  });
  window.addEventListener("pagehide", () => {
    void closeDb();
  });
}
