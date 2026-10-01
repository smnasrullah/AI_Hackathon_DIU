import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "../features/auth/authStore";
import { signIn, tokensFor } from "../features/auth/testUtils";
import { api, authClient, refreshAccessToken } from "./api";

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) {
    return Promise.reject(new AxiosError(String(status), "ERR_BAD_REQUEST", config, null, response));
  }
  return Promise.resolve(response);
}

const originalApiAdapter = api.defaults.adapter;
const originalAuthAdapter = authClient.defaults.adapter;

describe("api client", () => {
  let seenAuth: (string | undefined)[];
  let refreshCalls: number;

  beforeEach(() => {
    signIn("agent");
    seenAuth = [];
    refreshCalls = 0;
  });

  afterEach(() => {
    api.defaults.adapter = originalApiAdapter;
    authClient.defaults.adapter = originalAuthAdapter;
  });

  function protectedEndpoint(validToken: string): AxiosAdapter {
    return (config) => {
      const auth = config.headers.get("Authorization");
      seenAuth.push(typeof auth === "string" ? auth : undefined);
      return auth === `Bearer ${validToken}`
        ? respond(config, 200, { ok: true })
        : respond(config, 401, { detail: "token_expired" });
    };
  }

  it("refreshes once on 401 and retries with the new token", async () => {
    api.defaults.adapter = protectedEndpoint("access-2");
    authClient.defaults.adapter = (config) => {
      refreshCalls += 1;
      // The refresh token rides in the httpOnly cookie, never in the body.
      expect(config.url).toBe("/auth/refresh");
      expect(config.data).toBeUndefined();
      return respond(config, 200, tokensFor("agent"));
    };

    const [a, b] = await Promise.all([api.get("/agents/1"), api.get("/agents/1/risk")]);
    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(seenAuth).toContain("Bearer access-1");
    expect(useAuthStore.getState().accessToken).toBe("access-2");
  });

  it("signs out when the refresh token is rejected", async () => {
    api.defaults.adapter = protectedEndpoint("never");
    authClient.defaults.adapter = (config) => respond(config, 401, { detail: "invalid_refresh_token" });

    await expect(api.get("/agents/1")).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().notice).toBe("session_expired");
  });

  it("silent refresh on load restores the session from the cookie", async () => {
    useAuthStore.setState({ status: "checking", accessToken: null, user: null });
    authClient.defaults.adapter = (config) => respond(config, 200, tokensFor("distributor"));
    await expect(refreshAccessToken()).resolves.toBe("access-2");
    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useAuthStore.getState().user?.role).toBe("distributor");
  });

  it("silent refresh without a cookie ends quietly signed out", async () => {
    useAuthStore.setState({ status: "checking", accessToken: null, user: null });
    authClient.defaults.adapter = (config) => respond(config, 401, { detail: "invalid_refresh_token" });
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().notice).toBeNull();
  });

  it("keeps the session on a network error", async () => {
    authClient.defaults.adapter = (config) =>
      Promise.reject(new AxiosError("Network Error", "ERR_NETWORK", config));
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe("signedIn");
  });

  it("does not refresh on a failed login", async () => {
    api.defaults.adapter = (config) => respond(config, 401, { detail: "invalid_credentials" });
    authClient.defaults.adapter = (config) => {
      refreshCalls += 1;
      return respond(config, 500, {});
    };

    await expect(api.post("/auth/login", { email: "x", password: "y" })).rejects.toBeInstanceOf(AxiosError);
    expect(refreshCalls).toBe(0);
  });

  it("keeps a 403 as a 403 without refreshing", async () => {
    api.defaults.adapter = (config) => respond(config, 403, { detail: "forbidden" });
    await expect(api.get("/agents/2")).rejects.toMatchObject({ response: { status: 403 } });
    expect(useAuthStore.getState().user).not.toBeNull();
  });
});
