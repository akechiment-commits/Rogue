import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEMS, MAGIC_MARKER, makeFreshDuplicate, penInitialCharges } from "../items.js";

afterEach(() => vi.restoreAllMocks());

describe.each([
  ["plain", 3, 6], ["light", 2, 3], ["sanctuary", 1, 2], ["portal", 2, 3],
])("%sのペンの複製初期回数", (effect, minimum, maximum) => {
  it.each([0, 0.99999])("乱数%sでは通常生成と同じ下限・上限になり、元の回数を変えない", random => {
    const template = ITEMS.find(item => item.type === "pen" && item.effect === effect);
    const original = { ...template, charges: 99 };
    vi.spyOn(Math, "random").mockReturnValue(random);
    const copy = makeFreshDuplicate(original);
    expect(copy.charges).toBe(random === 0 ? minimum : maximum);
    expect(copy.charges).toBe(penInitialCharges(template, () => random));
    expect(original.charges).toBe(99);
  });
});

it("マーカーはペンのレア度別回数へ変えず、従来の新品回数に戻す", () => {
  const copy = makeFreshDuplicate({ ...MAGIC_MARKER, charges: 99 });
  expect(copy.charges).toBe(MAGIC_MARKER.charges);
});
