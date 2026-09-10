import { FormEvent, useEffect, useState } from "react";
import {
  initDb,
  insertTodo,
  listTodos,
  removeTodo,
  toggleTodo,
  updateTodoTitle,
} from "./db";
import type { Todo } from "./types";

type Status = "loading" | "ready" | "error";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    initDb()
      .then(listTodos)
      .then((items) => {
        setTodos(items);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const next = await insertTodo(title);
    setTodos(next);
    setTitle("");
  }

  async function onToggle(id: string) {
    setTodos(await toggleTodo(id));
  }

  async function onRemove(id: string) {
    setTodos(await removeTodo(id));
  }

  async function onSaveEdit(id: string) {
    setTodos(await updateTodoTitle(id, draft));
    setEditingId(null);
    setDraft("");
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Albedo · OPFS</p>
        <h1>Todos</h1>
        <p className="lede">
          Stored in Origin Private File System through a dedicated worker and
          albedo.wasm.
        </p>
      </header>

      <p data-testid="app-status" data-status={status} hidden={status === "ready"}>
        {status === "loading" ? "Opening OPFS bucket…" : error}
      </p>

      {status === "ready" && (
        <div data-testid="app-ready">
          <form className="composer" onSubmit={onCreate}>
            <input
              data-testid="todo-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Add a todo"
              aria-label="New todo"
            />
            <button data-testid="todo-add" type="submit" disabled={!title.trim()}>
              Add
            </button>
          </form>

          {todos.length === 0 ? (
            <p data-testid="todo-empty" className="empty">
              No todos yet.
            </p>
          ) : (
            <ul data-testid="todo-list" className="list">
              {todos.map((todo) => (
                <li
                  key={todo._id}
                  className={todo.completed ? "item done" : "item"}
                  data-testid="todo-item"
                  data-id={todo._id}
                  data-completed={todo.completed ? "true" : "false"}
                >
                  <input
                    data-testid="todo-toggle"
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => onToggle(todo._id)}
                    aria-label={`Complete ${todo.title}`}
                  />
                  {editingId === todo._id ? (
                    <form
                      className="edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onSaveEdit(todo._id);
                      }}
                    >
                      <input
                        data-testid="todo-edit-input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-label="Edit todo"
                      />
                      <button data-testid="todo-save" type="submit">
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="title"
                      data-testid="todo-title"
                      onDoubleClick={() => {
                        setEditingId(todo._id);
                        setDraft(todo.title);
                      }}
                    >
                      {todo.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="edit-btn"
                    data-testid="todo-edit"
                    onClick={() => {
                      setEditingId(todo._id);
                      setDraft(todo.title);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger"
                    data-testid="todo-delete"
                    onClick={() => onRemove(todo._id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
