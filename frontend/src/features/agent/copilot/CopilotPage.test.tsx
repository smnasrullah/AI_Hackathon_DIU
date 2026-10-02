import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { streamCopilotChat, type CopilotHandlers, type CopilotReply } from "../../../api/services/copilot";
import type { CopilotChatIn, LlmText } from "../../../api/types";
import { api as realApi } from "../../../lib/api";
import type { FakeApi } from "../../../test/fakeApi";
import { signIn } from "../../auth/testUtils";
import { CopilotPage } from "./CopilotPage";

vi.mock("../../../lib/api", async () => {
  const { createFakeApi } = await import("../../../test/fakeApi");
  return { api: createFakeApi(), authClient: { post: vi.fn() }, refreshAccessToken: vi.fn() };
});
vi.mock("../../../api/services/copilot", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../api/services/copilot")>();
  return { ...real, streamCopilotChat: vi.fn() };
});

const api = realApi as unknown as FakeApi;
const stream = vi.mocked(streamCopilotChat);
// Trailing space and "?" on purpose: the chip must send this text byte for byte.
const FIRST = "When will my cash run out? ";
const SECOND = "How do I request cash?";
const SUGGESTIONS = [FIRST, SECOND];

function answer(text: string, by: LlmText["generated_by"]): CopilotReply {
  return { agent_id: 1, route: "tool", answer: { text, generated_by: by } as LlmText };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CopilotPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("copilot suggestion chips", () => {
  let client: QueryClient | null = null;

  beforeEach(() => {
    api.reset();
    signIn("agent");
    api.on("get", "/copilot/suggestions", (_body, config) => ({ lang: config?.params?.lang, items: SUGGESTIONS }));
    stream.mockImplementation(async (_body: CopilotChatIn, h: CopilotHandlers) => {
      h.onDraft("Template draft");
      h.onDone(answer("Your cash may run out around 9 pm.", "replay"));
    });
  });

  afterEach(() => {
    client?.clear();
    client = null;
  });

  it("loads suggestions for the current language and shows them as chips", async () => {
    client = renderPage();
    const chips = await screen.findByTestId("copilot-suggestions");
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(SUGGESTIONS);
    expect(api.get).toHaveBeenCalledWith("/copilot/suggestions", expect.objectContaining({ params: { lang: "en" } }));
  });

  it("sends the exact suggestion text and shows the labelled answer", async () => {
    client = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: FIRST.trim() }));

    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0]?.[0]).toEqual({ message: FIRST, lang: "en" });
    expect(await screen.findByText("Your cash may run out around 9 pm.")).toBeInTheDocument();
    expect(screen.getByTestId("copilot-question").textContent).toBe(FIRST);
    expect(document.querySelector('[data-generated-by="replay"]')).toHaveTextContent("AI-generated wording (recorded)");
  });

  it("hides the chips quietly when suggestions fail, and typing still works", async () => {
    api.on("get", "/copilot/suggestions", () => {
      throw new Error("boom");
    });
    client = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("copilot-suggestions")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "  any swap offers?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(stream.mock.calls[0]?.[0]).toEqual({ message: "any swap offers?", lang: "en" }));
  });

  it("offers a retry when the chat call fails", async () => {
    stream.mockRejectedValueOnce(new Error("copilot_http_500"));
    client = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: SECOND }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Your cash may run out around 9 pm.")).toBeInTheDocument();
    expect(stream.mock.calls.map((c) => c[0].message)).toEqual([SECOND, SECOND]);
  });
});

describe("copilot event stream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses template and done events across chunk boundaries", async () => {
    signIn("agent");
    const { streamCopilotChat: realStream } = await vi.importActual<typeof import("../../../api/services/copilot")>(
      "../../../api/services/copilot",
    );
    const wire =
      'event: meta\r\ndata: {"agent_id":1}\r\n\r\n' +
      'event: template\r\ndata: {"text":"Draft"}\r\n\r\n' +
      'event: delta\r\ndata: {"text":"Fi"}\r\n\r\n' +
      'event: done\r\ndata: {"agent_id":1,"route":"tool","answer":{"text":"Final","generated_by":"llm"}}\r\n\r\n';
    const bytes = new TextEncoder().encode(wire);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 37));
        c.enqueue(bytes.slice(37));
        c.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDraft = vi.fn();
    const onDone = vi.fn();
    await realStream({ message: "When will my cash run out? ", lang: "en" }, { onDraft, onDone });

    expect(onDraft).toHaveBeenCalledWith("Draft");
    expect(onDone.mock.calls[0]?.[0].answer).toEqual({ text: "Final", generated_by: "llm" });
    const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init[1].body))).toEqual({ message: "When will my cash run out? ", lang: "en" });
    expect(new Headers(init[1].headers).get("Authorization")).toBe("Bearer access-1");
  });
});
