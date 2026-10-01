import axios, { type InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "../features/auth/authStore";
import type { TokenResponse } from "../features/auth/types";

const BASE_URL = "/api/v1";
const TIMEOUT_MS = 10_000;

export const api = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });
/** No interceptors: used for the refresh call itself so a 401 there cannot loop. */
export const authClient = axios.create({ baseURL: BASE_URL, timeout: TIMEOUT_MS });

const NO_REFRESH_PATHS = ["/auth/login", "/auth/refresh"];

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

let inflight: Promise<string | null> | null = null;

/** One shared refresh for all requests that hit 401 at the same time. */
export function refreshAccessToken(): Promise<string | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<string | null> {
  const { refreshToken, setSession, clear } = useAuthStore.getState();
  if (!refreshToken) {
    clear();
    return null;
  }
  try {
    const res = await authClient.post<TokenResponse>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    setSession(res.data);
    return res.data.access_token;
  } catch (err) {
    // Only a definite rejection ends the session; a network blip keeps it.
    if (axios.isAxiosError(err) && err.response?.status === 401) clear();
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
    return Promise.reject(error);
  }
  const config: RetriableConfig = error.config;
  const url = config.url ?? "";
  if (config._retried || NO_REFRESH_PATHS.some((p) => url.startsWith(p))) {
    return Promise.reject(error);
  }
  config._retried = true;
  const token = await refreshAccessToken();
  if (!token) return Promise.reject(error);
  config.headers.set("Authorization", `Bearer ${token}`);
  return api(config);
});
