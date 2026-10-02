// A tiny in-memory stand-in for the axios `api` client: tests register handlers per method + path.
import { vi, type Mock } from "vitest";

type Config = { params?: Record<string, unknown> };
type Handler = (body: unknown, config: Config | undefined) => unknown;
type Call = Mock<(...args: unknown[]) => Promise<{ data: unknown }>>;
type Method = "get" | "post" | "patch";

export interface FakeApi {
  get: Call;
  post: Call;
  patch: Call;
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
      const body = method === "get" ? undefined : second;
      const config = (method === "get" ? second : third) as Config | undefined;
      return { data: await handler(body, config) };
    });
  const api: FakeApi = {
    get: call("get"),
    post: call("post"),
    patch: call("patch"),
    on: (method, path, handler) => handlers.set(`${method} ${path}`, handler),
    reset: () => {
      handlers.clear();
      api.get.mockClear();
      api.post.mockClear();
      api.patch.mockClear();
    },
  };
  return api;
}
