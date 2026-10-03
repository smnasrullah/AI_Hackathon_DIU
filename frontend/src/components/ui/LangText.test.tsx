import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { scriptRuns } from "../../lib/scriptRuns";
import { LangText } from "./LangText";

function renderText(text: string): HTMLElement {
  const { container } = render(
    <p data-testid="host">
      <LangText text={text} />
    </p>,
  );
  return container.querySelector("p") as HTMLElement;
}

describe("LangText", () => {
  it("marks the Bangla part of an English sentence with lang=bn", () => {
    const p = renderText("Cash runs out in ২৩ ঘণ্টা ৩৫ মিনিট, ask your distributor.");
    const spans = p.querySelectorAll("[lang='bn']");
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe("২৩ ঘণ্টা ৩৫ মিনিট");
    expect(p.textContent).toBe("Cash runs out in ২৩ ঘণ্টা ৩৫ মিনিট, ask your distributor.");
  });

  it("keeps a Bangla phrase as one run, never per character", () => {
    const runs = scriptRuns("আজ বেতন দিন। কাল হাট।");
    expect(runs).toEqual([{ text: "আজ বেতন দিন। কাল হাট।", bn: true }]);
  });

  it("adds nothing to pure English", () => {
    const p = renderText("Cash runs out in 5h 20m.");
    expect(p.querySelector("[lang]")).toBeNull();
    expect(p.innerHTML).toBe("Cash runs out in 5h 20m.");
  });

  it("escapes markup: no HTML injection", () => {
    const p = renderText('<img src=x onerror="alert(1)"> বিপদ <b>bold</b>');
    expect(p.querySelector("img")).toBeNull();
    expect(p.querySelector("b")).toBeNull();
    expect(p.textContent).toBe('<img src=x onerror="alert(1)"> বিপদ <b>bold</b>');
    expect(p.querySelector("[lang='bn']")?.textContent).toBe("বিপদ");
  });

  it("joined runs give back the input unchanged", () => {
    const text = "Rahim উদ্দিন — ৳৫০০০ (cash) । done";
    expect(scriptRuns(text).map((r) => r.text).join("")).toBe(text);
  });
});
