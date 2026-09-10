# アイテム追加マニュアル

## 1. どの配列へ追加するか

定義の中心は `items.js` にある。

| 種類 | 定義場所 | 効果の主な実装場所 |
|---|---|---|
| 薬・巻物・武器・防具・矢など | `ITEMS` | `items.js` / `useItemActions.js` |
| 杖 | `WANDS` | `wands.js` |
| 壺 | `POTS` | `items.js` の `applyPotEffect()` |
| 指輪 | `RINGS` | `items.js` / `useItemActions.js` |
| 大箱 | `BB_TYPES` | `items.js` / `Game.jsx` / `wands.js` |
| 魔法書 | `SPELLBOOKS` と `SPELLS` | `items.js` / `useItemActions.js` |
| ペン | `ITEMS` の `type:"pen"` | `useItemActions.js` / `pentacleTurnEffects.js` |
| 食料 | `foodData.js` | `items.js` の `genFood()` |

既存の `items.js` 冒頭コメントにも最小手順があるが、このマニュアルでは生成・識別・図鑑・テストまで確認する。

## 2. 定義の基本形

```js
{
  name: "新しい薬",
  type: "potion",
  effect: "new_effect",
  value: 30,
  rarity: "C",
  weight: 4,
  sellPrice: 300,
  desc: "ゲーム内向けの短い説明。",
  tile: 16,
}
```

必要なフィールドは種類ごとに異なる。

- `type` はインベントリ、投擲、売却、図鑑カテゴリの基準。
- `effect`、`potEffect`、`spell` は処理分岐用の安定キー。
- `rarity` と `weight` は生成抽選、`sellPrice` は売却価格。
- 杖・ペン・筆は `charges`、壺は `capacity`、束ねる物は `count` を持つ。
- 実体生成時はテンプレートを直接変更せず、`{ ...template, id: uid() }` でコピーする。

## 3. 効果を実装する場所

### 薬

- 飲む・敵へ投げる効果は `applyPotionEffect()`。
- アイテムへ浴びせる効果は `applyPotionToItem()`。
- 着弾・飛沫は `splashPotion()`、水は `applyWaterSplash()`。
- プレイヤー・通常敵・ボス・アンデッド・祝福・呪いで分岐を確認する。

### 巻物・武器・防具・指輪

- 巻物や装備使用の入口は `useItemActions.js`。
- 攻撃・防御・属性・装備解除の共通処理を再利用する。
- 特殊能力を追加する場合は、能力名の定数・生成・表示ラベル・封印や状態異常との相互作用を確認する。

### 杖・ペン・壺・大箱

- 杖は `WANDS` へ定義を追加し、`wands.js` の `applyWandEffect()` の `switch` に同じ `effect` の `case` を追加する。
- ペンは `ITEMS` へ追加し、描画処理と魔方陣の毎ターン処理を確認する。
- 壺は `POTS` へ追加し、`applyPotEffect()` の処理、割れたときの効果、容量変化を追加する。
- 大箱は `BB_TYPES` の `kind` を追加し、開閉・投入・容量超過・破壊・散乱・識別の処理を確認する。

### 矢・石・特殊飛び道具

- `makeArrow()`、`makeStone()`、各 `make*()` と束分割・束再結合を確認する。
- 通常投擲は `throwItemAlongLine()`、特殊飛び道具は `advanceSpecialProjectiles()` と関連する衝突処理を確認する。
- 命中して消える、壁で落ちる、罠・泉・水・石像に触れるなどの終了条件を定義する。
- 敵専用弾の場合は、敵の生成時所持・消費・撃破時ドロップ・図鑑計上を分ける。

## 4. 識別・偽名・祝呪

- `getIdentKey()` が同種の識別単位として正しいか確認する。
- 未識別名が必要な種類は `UNIDENTIFIED_NAME_POOLS` と `generateFakeNames()` を確認する。
- `bc`、`blessed`、`cursed`、`bcKnown`、`fullIdent` の表示と効果を混同しない。
- 壺・金貨・矢など、祝呪対象外の種類を既存ルールに合わせる。
- 鑑定、全識別、未識別の罠、泉、大箱、杖破壊で同じ識別キーを使う。

## 5. 生成・売却・特殊入手

`dungeon.js` には通常フロア、特殊フロア、店、壁掘り、レア部屋など複数の生成経路がある。

- 通常の抽選対象なら `ITEMS`、`WANDS`、`POTS`、`RINGS`、`SPELLBOOKS` など適切なプールへ入れる。
- 壁掘り専用、敵専用、特殊合成専用なら通常抽選へ混ぜない。
- 店、変化の杖、変化の大箱、石像報酬、願い、複製、分裂が対象か決める。
- 売却額は `itemPrice()`、敵・店・図鑑の表示を確認する。
- 生成時の祝福・呪い抽選、杖の回数、壺の容量、矢の束数を確認する。

## 6. 図鑑・説明・セーブ

- ゲーム内説明は短く、詳細は `GUIDE_DESC_OVERRIDES` へ書く。
- 個体の図鑑計上は `DiscoveryTracker.js` の共通処理を使う。同じ `id` の再拾得・使用・投擲で二重計上しない。
- 床・手持ち・箱・泉・敵所持のどこから入手できるかを決める。
- アイテム固有状態をセーブする必要がある場合は `GameSave.js` とロード時の正規化を確認する。
- 旧セーブに新フィールドが無い場合でも、未定義を許容するかロード時に補完する。

## 7. テスト

- 定義、生成プール、価格、束ね、識別、祝呪。
- 使用、投擲、敵・石像・大箱・泉・罠への相互作用。
- 壊れた杖の効果、残回数0、特殊飛び道具の終了条件。
- 図鑑計上が個体ごとに1回だけであること。
- セーブ・ロード、旧セーブ、変化・複製・合成。

参考テスト: `tests/items.test.js`、`tests/wands.test.js`、`tests/inventoryRules.test.js`、`tests/DiscoveryTracker.test.js`、`tests/specialProjectiles.test.js`。
