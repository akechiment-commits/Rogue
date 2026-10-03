import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cleanups = vi.hoisted(() => []);
vi.mock("react", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, useRef: value => ({ current: value }), useCallback: fn => fn, useEffect: fn => cleanups.push(fn()) };
});
import React from "react";
import { MobileBtn } from "../GameButtons.jsx";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("React", React); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn?.()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const event = pointerId => ({ pointerId, button: 0, preventDefault: vi.fn() });
function fixture() {
  const action = vi.fn();
  const button = MobileBtn({ label: "↑", onClick: action, repeat: true });
  return { action, props: button.props };
}
describe("モバイルボタンの複数タッチ", () => {
  it("1本の指の長押しは繰り返し、離すと止まる", () => {
    const { props, action } = fixture();
    props.onPointerDown(event(1));
    vi.advanceTimersByTime(600);
    expect(action).toHaveBeenCalledTimes(3);
    props.onPointerUp(event(1));
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("同じボタンを2本の指で押しても、離した後にリピートが残らない", () => {
    const { props, action } = fixture();
    props.onPointerDown(event(1));
    props.onPointerDown(event(2));
    vi.advanceTimersByTime(600);
    props.onPointerUp(event(1));
    props.onPointerUp(event(2));
    const count = action.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("別の指のキャンセルは、押し続けている指の操作を止めない", () => {
    const { props, action } = fixture();
    props.onPointerDown(event(1));
    props.onPointerCancel(event(2));
    vi.advanceTimersByTime(600);
    expect(action).toHaveBeenCalledTimes(3);
    props.onPointerCancel(event(1));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("決定などの非リピートボタンも、同じ押下中の2本目の指では二重実行しない", () => {
    const action = vi.fn();
    const { props } = MobileBtn({ label: "決定", onClick: action, repeat: false });
    props.onPointerDown(event(1)); props.onPointerDown(event(2));
    expect(action).toHaveBeenCalledOnce();
    props.onPointerUp(event(1)); props.onPointerDown(event(3));
    expect(action).toHaveBeenCalledTimes(2);
  });
  it("押したまま画面から消えても、タイマーは全て終了する", () => {
    const { props, action } = fixture();
    props.onPointerDown(event(1)); props.onPointerDown(event(2));
    vi.advanceTimersByTime(600);
    cleanups.splice(0).forEach(fn => fn?.());
    const count = action.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(action).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("マウスの右ボタンでは発動しない", () => {
    const { props, action } = fixture();
    props.onPointerDown({ ...event(1), button: 2 });
    vi.advanceTimersByTime(1000);
    expect(action).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
