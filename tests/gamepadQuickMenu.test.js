import { describe, it, expect } from "vitest";
import React from "react";
globalThis.React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { GamepadQuickMenu } from "../GamepadQuickMenu.jsx";
import { playerTotalExp } from "../utils.js";

describe("GamepadQuickMenu", () => {
  it("現在の累計経験値と次のレベルまでの残り経験値を表示する", () => {
    const html = renderToStaticMarkup(
      React.createElement(GamepadQuickMenu, {
        open: true,
        dungeonLabel: "超上級",
        level: 3,
        exp: 5,
        nextExp: 22,
      }),
    );
    expect(playerTotalExp({ level: 3, exp: 5 })).toBe(30);
    expect(html).toContain("現在EXP:");
    expect(html).toContain("30");
    expect(html).toContain("次Lvまであと 17");
  });

  it("totalExp が明示された場合はその累計値を表示し、残り経験値は0以上にクランプされる", () => {
    const html = renderToStaticMarkup(
      React.createElement(GamepadQuickMenu, {
        open: true,
        exp: 1200,
        nextExp: 1000,
        totalExp: 2450,
      }),
    );
    expect(html).toContain("2,450");
    expect(html).toContain("次Lvまであと 0");
    expect(html).toContain("width:100%");
  });
});
