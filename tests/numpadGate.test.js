import { describe, it, expect, beforeEach } from "vitest";
import { isDuplicateDirectionEvent, directionFamily } from "../useKeyHandler.js";

const ev = (partial) => ({
  key: "ArrowDown",
  code: "Numpad2",
  location: 3,
  repeat: false,
  ...partial,
});

describe("numpad multi-fire gate", () => {
  beforeEach(() => {
    /* ゲートをリセットするため、別方向を通してから十分待つ代わりに
       モジュール内部状態は「別 family」で上書きしてからテストする */
    isDuplicateDirectionEvent(ev({ key: "ArrowLeft", code: "Numpad4", location: 3 }));
  });

  it("directionFamily が Numpad と Arrow を同じ方向にまとめる", () => {
    expect(directionFamily(ev({ key: "ArrowDown", code: "Numpad2" }))).toBe("down");
    expect(directionFamily(ev({ key: "ArrowDown", code: "ArrowDown", location: 0 }))).toBe("down");
    expect(directionFamily(ev({ key: "2", code: "Numpad2", location: 3 }))).toBe("down");
  });

  it("同一方向の連続 keydown を1回に潰す", () => {
    /* 別方向でゲートをリセット */
    isDuplicateDirectionEvent(ev({ key: "ArrowUp", code: "Numpad8" }));
    const first = isDuplicateDirectionEvent(ev({ key: "ArrowDown", code: "Numpad2" }));
    const second = isDuplicateDirectionEvent(ev({ key: "ArrowDown", code: "ArrowDown", location: 0 }));
    const third = isDuplicateDirectionEvent(ev({ key: "2", code: "Numpad2", location: 3 }));
    expect(first).toBe(false); /* 通す */
    expect(second).toBe(true); /* 捨てる */
    expect(third).toBe(true); /* 捨てる */
  });
});
