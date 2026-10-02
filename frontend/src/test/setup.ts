import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach, vi } from "vitest";

import "../i18n";
import { usePrefsStore } from "../lib/prefs";
import { queryClient } from "../lib/queryClient";
import { clearAppStorage, resetAllStores } from "../lib/storeRegistry";

// Animations finish instantly: exit transitions (AnimatePresence) must not keep nodes mounted
// for a frame-rate-dependent time, which made assertions flaky on a loaded CPU.
MotionGlobalConfig.skipAnimations = true;

// jsdom gaps that Radix popovers/menus and cmdk touch.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => undefined;
}

// Tests read English with English digits unless they switch explicitly.
beforeEach(() => {
  act(() => usePrefsStore.setState({ lang: "en", digits: "en", theme: "light" }));
});

// No state leaks between tests: DOM, zustand stores, storage, the app QueryClient, mocks, timers.
afterEach(() => {
  cleanup();
  act(() => resetAllStores());
  clearAppStorage();
  queryClient.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});
