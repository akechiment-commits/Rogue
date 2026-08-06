import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRunTimer } from "../runTimer.js";

describe("createRunTimer", () => {
  let now;
  let visibility;

  beforeEach(() => {
    now = 1000;
    visibility = "visible";
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("document", {
      get visibilityState() { return visibility; },
      addEventListener() {},
      removeEventListener() {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("加算する", () => {
    const t = createRunTimer(0);
    t.start();
    now = 3500;
    expect(t.getElapsedMs()).toBe(2500);
  });

  it("pause で止まる", () => {
    const t = createRunTimer(0);
    t.start();
    now = 2000;
    t.pause();
    now = 5000;
    expect(t.getElapsedMs()).toBe(1000);
  });

  it("freeze 後は増えない", () => {
    const t = createRunTimer(0);
    t.start();
    now = 2000;
    t.freeze();
    now = 9000;
    expect(t.getElapsedMs()).toBe(1000);
    expect(t.isFrozen()).toBe(true);
  });

  it("初期値から再開できる", () => {
    const t = createRunTimer(5000);
    t.start();
    now = 1500;
    expect(t.getElapsedMs()).toBe(5500);
  });

  it("非表示では start しない", () => {
    visibility = "hidden";
    const t = createRunTimer(100);
    t.start();
    now = 5000;
    expect(t.getElapsedMs()).toBe(100);
    expect(t.isRunning()).toBe(false);
  });
});
