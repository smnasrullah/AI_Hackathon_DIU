import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIdleTimeout } from "./useIdleTimeout";

vi.mock("./sessionChannel", () => ({ broadcast: vi.fn(), subscribe: vi.fn(() => () => undefined) }));

describe("useIdleTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns after the idle period, then times out", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(true, onTimeout, 5_000, 3_000));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.warning).toBe(true);
    expect(result.current.secondsLeft).toBe(3);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toBe(false);
  });

  it("activity postpones the warning and stay dismisses it", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(true, onTimeout, 5_000, 3_000));
    act(() => {
      vi.advanceTimersByTime(4_000);
      window.dispatchEvent(new KeyboardEvent("keydown"));
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.warning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.warning).toBe(true);
    act(() => result.current.stay());
    expect(result.current.warning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("does nothing while signed out", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(false, onTimeout, 1_000, 1_000));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.warning).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
