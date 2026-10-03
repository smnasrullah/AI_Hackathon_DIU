// A tiny in-memory stand-in for the axios `api` client: tests register handlers per method + path.
import { vi, type Mock } from "vitest";

type Config = { params?: Record<string, unknown> };
type Handler = (body: unknown, config: Config | undefined) => unknown;
type Call = Mock<(...args: unknown[]) => Promise<{ data: unknown }>>;
type Method = "get" | "post" | "patch" | "put" | "delete";

export interface FakeApi {
  get: Call;
  post: Call;
  patch: Call;
  put: Call;
  delete: Call;
  on: (method: Method, path: string, handler: Handler) => void;
  reset: () => void;
}

export function createFakeApi(): FakeApi {
  const handlers = new Map<string, Handler>();
  const call = (method: Method): Call =>
    vi.fn(async (...args: unknown[]) => {
      const [path, second, third] = args;
      const handler = handlers.get(`${method} ${String(path)}`);
      if (!handler) throw new Error(`fakeApi: no handler for ${method.toUpperCase()} ${String(path)}`);
      const noBody = method === "get" || method === "delete";
      const body = noBody ? undefined : second;
      const config = (noBody ? second : third) as Config | undefined;
      return { data: await handler(body, config) };
    });
  const api: FakeApi = {
    get: call("get"),
    post: call("post"),
    patch: call("patch"),
    put: call("put"),
    delete: call("delete"),
    on: (method, path, handler) => handlers.set(`${method} ${path}`, handler),
    reset: () => {
      handlers.clear();
      api.get.mockClear();
      api.post.mockClear();
      api.patch.mockClear();
      api.put.mockClear();
      api.delete.mockClear();
    },
  };
  return api;
}
