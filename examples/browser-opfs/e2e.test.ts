import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";

const root = import.meta.dir;
const distDir = path.join(root, "dist");
const WebView = (Bun as unknown as { WebView?: new (options?: object) => WebViewLike }).WebView;

type WebViewLike = {
  navigate(url: string): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  type(text: string): Promise<void>;
  evaluate(script: string): Promise<unknown>;
  reload(): Promise<void>;
  close(): void;
};

function hasWebView(): boolean {
  return typeof WebView === "function";
}

async function waitFor(
  view: WebViewLike,
  script: string,
  timeout = 15_000,
): Promise<unknown> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeout) {
    last = await view.evaluate(script);
    if (last) return last;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for: ${script} (last=${JSON.stringify(last)})`);
}

describe("browser-opfs todo app", () => {
  if (!hasWebView()) {
    test.skip("requires Bun.WebView (Bun 1.3.12+)", () => {});
    return;
  }

  let server: ReturnType<typeof Bun.serve> | null = null;
  let origin = "";
  let view: WebViewLike;

  beforeAll(async () => {
    const build = spawn("bun", ["x", "vite", "build"], {
      cwd: root,
      stdio: "inherit",
    });
    const code = await new Promise<number>((resolve) => {
      build.on("exit", (value) => resolve(value ?? 1));
    });
    if (code !== 0) {
      throw new Error("vite build failed");
    }

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(path.join(distDir, pathname));
        if (await file.exists()) {
          return new Response(file);
        }
        return new Response("Not found", { status: 404 });
      },
    });
    origin = `http://${server.hostname}:${server.port}`;
    const profileDir = path.join(root, ".webview-profile");
    view = new WebView({
      width: 900,
      height: 720,
      backend: "chrome",
      dataStore: { directory: profileDir },
    });
    await view.navigate(origin);
    await waitFor(
      view,
      `document.querySelector('[data-testid="app-ready"]') ? true : false`,
    );
  }, 60_000);

  afterAll(() => {
    view?.close();
    server?.stop(true);
  });

  test("creates a todo", async () => {
    await view.click('[data-testid="todo-input"]');
    await view.type("Buy milk");
    await view.click('[data-testid="todo-add"]');
    const titles = await waitFor(
      view,
      `[...document.querySelectorAll('[data-testid="todo-title"]')].map(el => el.textContent).join("|")`,
    );
    expect(String(titles)).toContain("Buy milk");
  });

  test("toggles a todo complete", async () => {
    await view.click('[data-testid="todo-toggle"]');
    const completed = await waitFor(
      view,
      `document.querySelector('[data-testid="todo-item"]')?.getAttribute("data-completed") === "true"`,
    );
    expect(completed).toBe(true);
  });

  test("updates a todo title", async () => {
    await view.click('[data-testid="todo-edit"]');
    await view.click('[data-testid="todo-edit-input"]');
    await view.evaluate(
      `(() => { const el = document.querySelector('[data-testid="todo-edit-input"]'); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
    );
    await view.type("Buy oat milk");
    await view.click('[data-testid="todo-save"]');
    const titles = await waitFor(
      view,
      `[...document.querySelectorAll('[data-testid="todo-title"]')].map(el => el.textContent).includes("Buy oat milk")`,
    );
    expect(titles).toBe(true);
  });

  test("deletes a todo", async () => {
    await view.click('[data-testid="todo-delete"]');
    const empty = await waitFor(
      view,
      `Boolean(document.querySelector('[data-testid="todo-empty"]'))`,
    );
    expect(empty).toBe(true);
  });

  test("persists todos in OPFS across reload", async () => {
    await view.click('[data-testid="todo-input"]');
    await view.type("Persisted task");
    await view.click('[data-testid="todo-add"]');
    await waitFor(
      view,
      `[...document.querySelectorAll('[data-testid="todo-title"]')].map(el => el.textContent).includes("Persisted task")`,
    );

    await view.evaluate(
      `window.__closeDb ? window.__closeDb() : Promise.resolve()`,
    );
    await view.reload();
    await waitFor(
      view,
      `document.querySelector('[data-testid="app-ready"]') ? true : false`,
    );
    const titles = await waitFor(
      view,
      `[...document.querySelectorAll('[data-testid="todo-title"]')].map(el => el.textContent).includes("Persisted task")`,
    );
    expect(titles).toBe(true);
  }, 20_000);
});
