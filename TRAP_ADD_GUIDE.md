# 罠追加マニュアル

## 1. 定義場所に注意する

罠の配列 `TRAPS` は現在 `items.js` にある。`traps.js` は主にプレイヤーが踏んだ場合の発動処理を担当する。

```js
{
  name: "新しい罠",
  effect: "new_trap",
  tile: 217,
  rarity: "C",
  weight: 4,
  desc: "ゲーム内向けの短い説明。",
}
```

## 2. 発動経路を分けて実装する

同じ罠でも起動者によって入口が違う。

| 起動者 | 主な入口 | 確認事項 |
|---|---|---|
| プレイヤー | `traps.js` の `fireTrapPlayer()` | プレイヤー状態、ターン消費、耐性、表示 |
| 落ちたアイテム | `items.js` の `fireTrapItem()` | アイテム消費、飛散、泉・水・大箱への連鎖 |
| 敵 | `fireTrapItem()` または敵AI | 敵へのダメージ・状態異常・撃破・ドロップ |
| 重力 | `monsters.js` の `_checkGravityTrap()` | 内部トリガー。床アイテムを生成しない |
| ダッシュ・移動 | `Game.jsx` の移動処理 | 既知罠の二重発動を防ぐ |

新しい `effect` は、必要な入口すべてに `case` を追加する。片方だけ実装すると、踏んだときだけ動く、投げて起動したときだけ動く、といった不整合になる。

## 3. 罠の共通状態

- `id`: 個体ID。生成時に `uid()` を付ける。
- `revealed`: 発見済みか。発見・作動・図鑑計上を分ける。
- `permanent`: 作動後に残るか。
- `rarity`、`weight`: `pickTrap()` の抽選値。
- `tile`: スタイル1〜3の表示に使うID。

作動・破損・看破は `trackTrap()` を通す。同じ罠を調べる、踏む、アイテムで起動する、といった後続処理で図鑑を再計上しない。

## 4. 効果の設計

先に次を表にしてからコードを書く。

- プレイヤーが踏んだ場合
- 敵が踏んだ場合
- アイテムが落ちた場合
- 投擲物・敵特技・重力で起動した場合
- 祝福・呪いがあるか
- 耐性・浮遊・体幹・聖域・魔封じの影響
- 作動後に壊れるか、再発動するか
- 罠の上のアイテム・水・泉・大箱・石像をどう扱うか

既存の共通処理を使う。

- `maybeBreakTrapAfterStep()`：作動後破損
- `removeTrap()`：罠の除去
- `placeItemAt()`：落下物の着地
- `applyPlayerTrip()`、`applyPlayerLevelDown()`：既存の状態効果
- `trackTrap()`：図鑑計上

## 5. 生成・表示・説明

- `pickTrap()` の候補に入るか、特殊生成専用か決める。
- `dungeon.js` の通常・特殊・ボス・罠生成の全経路を確認する。
- ゲーム内説明は `TRAPS` の `desc` を短くする。
- 詳細は `generate_final_guide.js` の `GUIDE_DESC_OVERRIDES` と罠一覧へ追加する。
- 罠のタイルID、未発見時の見た目、発見済み表示、調べる説明を確認する。
- 新しい個別グラフィックは `GRAPHICS_ADD_GUIDE.md` に従う。

## 6. テスト

- 定義、レア度、抽選、生成数。
- プレイヤー・敵・アイテム・重力による発動。
- 耐性、浮遊、体幹、聖域、魔封じ、ボス保護。
- 作動後の破損、連鎖、二重発動防止。
- 罠の図鑑計上が個体ごとに1回だけであること。

参考テスト: `tests/traps.test.js`、`tests/newTraps.test.js`、`tests/turnHazards.test.js`、`tests/gravityTrap.test.js`、`tests/DiscoveryTracker.test.js`。
