export type Todo = {
  _id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

export type WorkerRequest = {
  id: number;
  type: "init" | "list" | "insert" | "toggle" | "updateTitle" | "remove" | "close";
  payload?: unknown;
};

export type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};
