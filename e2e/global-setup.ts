// Wait until the stack has finished bootstrapping (migrate, seed, train) before any test runs.

const baseURL = process.env.E2E_BASE_URL ?? "http://frontend";
const TIMEOUT_MS = Number(process.env.E2E_READY_TIMEOUT_MS ?? 600_000);
const POLL_MS = 2_000;

interface Status {
  ready: boolean;
  bootstrap_state: string;
}

export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = "unreachable";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/v1/system/status`);
      if (res.ok) {
        const body = (await res.json()) as Status;
        if (body.ready) return;
        last = body.bootstrap_state;
        if (last === "failed") throw new Error("Backend bootstrap failed; see `docker compose logs backend`.");
      } else {
        last = `HTTP ${res.status}`;
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Backend bootstrap failed")) throw err;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(`Stack not ready after ${TIMEOUT_MS / 1000}s (last state: ${last}).`);
}
