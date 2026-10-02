import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import "../i18n";
import { usePrefsStore } from "../lib/prefs";

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

afterEach(() => cleanup());
