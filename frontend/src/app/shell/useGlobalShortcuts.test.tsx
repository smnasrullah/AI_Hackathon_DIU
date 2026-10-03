import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PHONE_QUERY, useShellStore } from "./shellStore";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

const realMatchMedia = window.matchMedia;

function setPhone(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: phone && query === PHONE_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Harness({ sidebar }: { sidebar: boolean }) {
  useGlobalShortcuts("/admin", sidebar);
  return (
    <>
      <input aria-label="field" />
      <textarea aria-label="area" />
      <select aria-label="pick">
        <option>a</option>
      </select>
      <div aria-label="editable" contentEditable suppressContentEditableWarning />
    </>
  );
}

function mount(sidebar = true) {
  return render(
    <MemoryRouter>
      <Harness sidebar={sidebar} />
    </MemoryRouter>,
  );
}

const collapsed = () => useShellStore.getState().sidebarCollapsed;

describe('"[" sidebar shortcut', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("toggles the saved width on desktop", () => {
    setPhone(false);
    mount();
    fireEvent.keyDown(window, { key: "[" });
    expect(collapsed()).toBe(true);
    fireEvent.keyDown(window, { key: "[" });
    expect(collapsed()).toBe(false);
  });

  it("never changes the saved desktop preference on phone widths", () => {
    setPhone(true);
    mount();
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "[" });
    expect(collapsed()).toBe(false);
  });

  it("does nothing in the agent shell, which has no sidebar", () => {
    setPhone(false);
    mount(false);
    fireEvent.keyDown(window, { key: "[" });
    expect(collapsed()).toBe(false);
  });

  it("is ignored while typing in an input, textarea, select or contenteditable", () => {
    setPhone(false);
    const { getByLabelText } = mount();
    for (const label of ["field", "area", "pick", "editable"]) {
      fireEvent.keyDown(getByLabelText(label), { key: "[" });
    }
    expect(collapsed()).toBe(false);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }])("is ignored with modifier %o", (mod) => {
    setPhone(false);
    mount();
    fireEvent.keyDown(window, { key: "[", ...mod });
    expect(collapsed()).toBe(false);
  });
});
