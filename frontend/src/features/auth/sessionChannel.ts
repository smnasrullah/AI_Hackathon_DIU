/** Cross-tab session messages. No-ops where BroadcastChannel is missing. */
export type SessionMessage = { type: "logout" } | { type: "activity" };

const CHANNEL = "agentpulse-session";

function open(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

export function broadcast(message: SessionMessage): void {
  const channel = open();
  if (!channel) return;
  channel.postMessage(message);
  channel.close();
}

export function subscribe(onMessage: (message: SessionMessage) => void): () => void {
  const channel = open();
  if (!channel) return () => undefined;
  channel.onmessage = (event: MessageEvent<SessionMessage>) => onMessage(event.data);
  return () => channel.close();
}
