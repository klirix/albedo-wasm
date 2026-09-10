/// <reference types="vite/client" />

declare module "*?worker" {
  const WorkerFactory: {
    new (): Worker;
  };
  export default WorkerFactory;
}

declare module "albedo-wasm/albedo.wasm?url" {
  const url: string;
  export default url;
}
