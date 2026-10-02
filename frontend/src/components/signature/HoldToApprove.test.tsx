import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HoldToApprove } from "./HoldToApprove";

function button() {
  return screen.getByRole("button", { name: /hold to approve/i });
}

describe("HoldToApprove timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("approves only after a full 1 second hold", () => {
    const onApprove = vi.fn();
    render(<HoldToApprove onApprove={onApprove} />);
    fireEvent.pointerDown(button());
    act(() => vi.advanceTimersByTime(999));
    expect(onApprove).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /approved/i })).toHaveAttribute("data-state", "done");
  });

  it("does nothing when released early, and says to keep holding", () => {
    const onApprove = vi.fn();
    render(<HoldToApprove onApprove={onApprove} />);
    fireEvent.pointerDown(button());
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(button());
    act(() => vi.advanceTimersByTime(2000));
    expect(onApprove).not.toHaveBeenCalled();
    expect(button()).toHaveAttribute("data-state", "early");
    expect(screen.getByText("Keep holding until the ring fills.")).toBeInTheDocument();
  });

  it("restarts the full hold after an early release", () => {
    const onApprove = vi.fn();
    render(<HoldToApprove onApprove={onApprove} />);
    fireEvent.pointerDown(button());
    act(() => vi.advanceTimersByTime(700));
    fireEvent.pointerUp(button());
    fireEvent.pointerDown(button());
    act(() => vi.advanceTimersByTime(700));
    expect(onApprove).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("works from the keyboard: hold Space", () => {
    const onApprove = vi.fn();
    render(<HoldToApprove onApprove={onApprove} holdMs={1000} />);
    fireEvent.keyDown(button(), { key: " " });
    fireEvent.keyDown(button(), { key: " ", repeat: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("never fires when disabled", () => {
    const onApprove = vi.fn();
    render(<HoldToApprove onApprove={onApprove} disabled />);
    fireEvent.pointerDown(button());
    act(() => vi.advanceTimersByTime(1500));
    expect(onApprove).not.toHaveBeenCalled();
  });
});
