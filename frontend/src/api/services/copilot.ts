import { useAuthStore } from "../../features/auth/authStore";
import { api, refreshAccessToken } from "../../lib/api";
import type { CopilotChatIn, CopilotSuggestions, Lang, LlmText } from "../types";

export async function copilotSuggestions(lang: Lang, signal?: AbortSignal): Promise<CopilotSuggestions> {
  return (await api.get<CopilotSuggestions>("/copilot/suggestions", { params: { lang }, signal })).data;
}

/** SSE `done` payload (backend CopilotReply; the stream is not in the OpenAPI response models). */
export interface CopilotReply {
  agent_id: number;
  route: string;
  answer: LlmText;
}

export interface CopilotHandlers {
  /** Deterministic template answer, sent before the final wording. */
  onDraft: (text: string) => void;
  onDone: (reply: CopilotReply) => void;
}

const CHAT_URL = "/api/v1/copilot/chat";

function post(body: CopilotChatIn, token: string | null, signal?: AbortSignal): Promise<Response> {
  return fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
}

function dispatch(block: string, h: CopilotHandlers): void {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return;
  const payload: unknown = JSON.parse(data.join("\n"));
  if (event === "template") h.onDraft((payload as { text: string }).text);
  else if (event === "done") h.onDone(payload as CopilotReply);
  else if (event === "error") throw new Error((payload as { detail: string }).detail);
}

/**
 * POST /copilot/chat and read its event stream (fetch: axios cannot stream). `message` is sent
 * exactly as given. One token refresh on 401, like the axios client.
 */
export async function streamCopilotChat(body: CopilotChatIn, h: CopilotHandlers, signal?: AbortSignal): Promise<void> {
  let res = await post(body, useAuthStore.getState().accessToken, signal);
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (token) res = await post(body, token, signal);
  }
  if (!res.ok || !res.body) throw new Error(`copilot_http_${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = done ? "" : (blocks.pop() ?? "");
    for (const block of blocks) dispatch(block, h);
    if (done) return;
  }
}
