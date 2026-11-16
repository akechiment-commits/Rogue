import { describe, it, expect } from "vitest";
import React from "react";
globalThis.React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { GamepadQuickMenu } from "../GamepadQuickMenu.jsx";

describe("GamepadQuickMenu", () => {
  it("現在の経験値・次レベル必要経験値・残り経験値を表示する", () => {
    const html = renderToStaticMarkup(
      React.createElement(GamepadQuickMenu, {
        open: true,
        dungeonLabel: "超上級",
        exp: 1234,
        nextExp: 5000,
      }),
    );
    expect(html).toContain("現在EXP:");
    expect(html).toContain("1,234");
    expect(html).toContain("5,000");
    expect(html).toContain("次Lvまであと 3,766");
  });

  it("経験値が次レベル必要経験値以上でも残り経験値は0以上にクランプされる", () => {
    const html = renderToStaticMarkup(
      React.createElement(GamepadQuickMenu, {
        open: true,
        exp: 1200,
        nextExp: 1000,
      }),
    );
    expect(html).toContain("次Lvまであと 0");
    expect(html).toContain("width:100%");
  });
});
