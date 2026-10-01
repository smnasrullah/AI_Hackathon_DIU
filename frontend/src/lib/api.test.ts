import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "../features/auth/authStore";
import { makeUser, signIn } from "../features/auth/testUtils";
import { api, authClient } from "./api";

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
      return respond(config, 200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
        expires_in: 900,
        user: makeUser("agent"),
      });
    };

    const [a, b] = await Promise.all([api.get("/agents/1"), api.get("/agents/1/risk")]);
    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(seenAuth).toContain("Bearer access-1");
    expect(useAuthStore.getState().refreshToken).toBe("refresh-2");
  });

  it("signs out when the refresh token is rejected", async () => {
    api.defaults.adapter = protectedEndpoint("never");
    authClient.defaults.adapter = (config) => respond(config, 401, { detail: "invalid_refresh_token" });

    await expect(api.get("/agents/1")).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().user).toBeNull();
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
