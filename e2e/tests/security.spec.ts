import { gzipSync } from "node:zlib";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNTS, dismissTour, fillLogin, logoutFromMenu } from "./helpers";

const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;
const BUDGET_GZIP_BYTES = 250 * 1024;

test("tokens never reach web storage; the refresh cookie is httpOnly and scoped", async ({
  page,
  context,
}) => {
  const { email, password, home } = ACCOUNTS.agent;
  const login = page.waitForResponse((r) => r.url().endsWith("/api/v1/auth/login") && r.ok());
  await fillLogin(page, email, password);
  const access = ((await (await login).json()) as { access_token: string }).access_token;
  await expect(page).toHaveURL((url) => url.pathname === home);
  await dismissTour(page);
  // A reload restores the session through the refresh cookie and mints a new access token.
  await page.goto("/agent/forecast");
  await page.waitForLoadState("networkidle");

  const visible = await page.evaluate(() => {
    const out: string[] = [document.cookie];
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i) ?? "";
        out.push(`${key}=${store.getItem(key) ?? ""}`);
      }
    }
    return out.join("\n");
  });
  expect(visible).not.toContain(access);
  expect(visible).not.toMatch(JWT);
  expect(visible).not.toContain("ap_refresh");

  const refresh = (await context.cookies()).find((c) => c.name === "ap_refresh");
  expect(refresh, "refresh cookie set").toBeDefined();
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe("Lax");
  expect(refresh?.path).toBe("/api/v1/auth");

  await logoutFromMenu(page);
  expect((await context.cookies()).find((c) => c.name === "ap_refresh")).toBeUndefined();
  // The old refresh token is revoked server-side, not just dropped by the browser.
  const replay = await page.request.post("/api/v1/auth/refresh", {
    headers: { Cookie: `ap_refresh=${refresh?.value ?? ""}` },
  });
  expect(replay.status()).toBe(401);
});

/** Every JS / CSS file the built app can load: index.html plus everything chunks import. */
async function crawlAssets(request: APIRequestContext): Promise<Map<string, string>> {
  const html = await (await request.get("/")).text();
  const found = new Map<string, string>([["/index.html", html]]);
  const queue = [...html.matchAll(/\/assets\/([\w.-]+\.(?:js|css))/g)].map((m) => m[1]);
  const seen = new Set(queue);
  while (queue.length) {
    const name = queue.shift() ?? "";
    const res = await request.get(`/assets/${name}`);
    if (!res.ok()) continue;
    const text = await res.text();
    found.set(`/assets/${name}`, text);
    for (const m of text.matchAll(/([\w-]+\.js)(?=["'`])/g)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        queue.push(m[1]);
      }
    }
  }
  return found;
}

test("the frontend bundle carries no secret", async ({ request }) => {
  const assets = await crawlAssets(request);
  expect(assets.size, "crawled the lazy chunks too").toBeGreaterThan(20);
  // Short values are defaults, not secrets (POSTGRES_PASSWORD=agentpulse is also the storage prefix).
  const values = ["JWT_SECRET", "LLM_API_KEY", "POSTGRES_PASSWORD"]
    .map((k) => [k, process.env[k] ?? ""] as const)
    .filter(([, v]) => v.length >= 16);
  const shapes = [/sk-ant-[\w-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/,
    /\bJWT_SECRET\b/, /\bLLM_API_KEY\b/, /\bDATABASE_URL\b/];
  const leaks: string[] = [];
  for (const [file, text] of assets) {
    for (const [key, v] of values) if (text.includes(v)) leaks.push(`${file}: contains the value of ${key}`);
    for (const re of shapes) if (re.test(text)) leaks.push(`${file}: matches ${re.source}`);
  }
  expect(leaks, leaks.join("\n")).toEqual([]);
});

for (const path of ["/", "/login"]) {
  test(`first load of ${path} ships under 250 KB of gzipped JS`, async ({ page }) => {
    const bodies: Promise<number>[] = [];
    page.on("response", (res) => {
      const url = new URL(res.url());
      if (url.pathname.startsWith("/assets/") && url.pathname.endsWith(".js")) {
        bodies.push(res.body().then((b) => gzipSync(b).length));
      }
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const sizes = await Promise.all(bodies);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(sizes.length).toBeGreaterThan(0);
    expect(total, `${(total / 1024).toFixed(1)} KB gzip`).toBeLessThan(BUDGET_GZIP_BYTES);
  });
}

test("nginx sends security headers and compresses assets", async ({ request }) => {
  const page = await request.get("/login");
  expect(page.headers()["x-frame-options"]).toBe("DENY");
  expect(page.headers()["x-content-type-options"]).toBe("nosniff");
  expect(page.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  const html = await page.text();
  const entry = html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? "";
  const js = await request.get(entry, { headers: { "Accept-Encoding": "gzip" } });
  expect(js.headers()["content-encoding"]).toBe("gzip");
  const api = await request.get("/api/v1/system/status");
  expect(api.headers()["cache-control"]).toBe("no-store");
});
