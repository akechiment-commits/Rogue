# 杖・ペン・魔法書追加マニュアル

## 杖

### 定義

`items.js` の `WANDS` に追加する。

```js
{
  name: "新しい杖",
  type: "wand",
  effect: "new_wand_effect",
  charges: 4,
  rarity: "C",
  weight: 4,
  sellPrice: 500,
  desc: "短いゲーム内説明。",
  tile: 24,
}
```

### 効果

`wands.js` の `applyWandEffect()` に `case "new_wand_effect"` を追加する。ファイル冒頭の既存コメントにある通り、定義だけ追加して `switch` を追加し忘れると効果が発動しない。

確認項目:

- プレイヤー、敵、アイテム、罠、大箱、石像への命中
- 通常・祝福・呪いの3状態
- 壁反射、魔封じ、魔法反射、魔法無効、聖域
- 壊したときの周囲効果と残回数0の扱い
- 識別、回数表示、充填の大箱、合成
- `generate_final_guide.js` の `WAND_DETAILS` と `GUIDE_DESC_OVERRIDES`

## ペン・魔方陣

ペンは独立した `PENS` 配列ではなく、`items.js` の `ITEMS` に `type:"pen"` として登録する。

```js
{
  name: "新しいペン",
  type: "pen",
  effect: "new_pentacle",
  charges: 2,
  rarity: "C",
  weight: 4,
  sellPrice: 800,
  desc: "短いゲーム内説明。",
  tile: 42,
}
```

追加箇所を確認する。

- `useItemActions.js`: ペンを使って魔方陣を描く入口、祝福・呪い、消費、足元の占有
- `pentacleTurnEffects.js`: 毎ターン効果、対象範囲、魔封じ、魔法無効
- `Game.jsx`: 魔方陣の表示、即時効果、移動・攻撃・UIとの接続
- `fixtureQueries.js`、`items.js`: 杖・炎・爆発・石像・床オブジェクトとの相互作用
- `generate_final_guide.js` の `penData`

通常・祝福・呪いで範囲が部屋内／フロア全体に変わる場合、プレイヤー、敵、投射物、床オブジェクトの対象範囲を個別にテストする。

## 魔法書・習得魔法

- `items.js` の `SPELLS` に魔法効果、MP、射程、方向入力、説明を追加する。
- `SPELLBOOKS` に対応する魔法書を追加する。
- `useItemActions.js` の魔法書を読む処理、習得済みのレベルアップ、呪い時の別魔法抽選を確認する。
- `castSpellBolt()` または魔法効果の `switch` に処理を追加する。
- `generate_final_guide.js` の魔法書一覧とMP説明へ追加する。
- MP消費、魔封じ、魔法反射、魔法無効、石像、聖域、壁反射、アンデッド補正をテストする。

## テスト

参考テスト: `tests/wands.test.js`、`tests/sealMagic.test.js`、`tests/blessedHealAndCursedWands.test.js`、`tests/pentacleTurnEffects.test.js`、`tests/spellbookDescription.test.js`。
