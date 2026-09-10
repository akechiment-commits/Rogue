# Rogue コンテンツ追加マニュアル

このファイルは、ゲームへ新しいコンテンツを追加するときの入口です。
「定義を1か所に書けば終わり」ではなく、生成・実行・表示・識別・図鑑・セーブ・テストまでを確認するために使います。

## カテゴリ別マニュアル

| 追加するもの | マニュアル | 主な定義・実装箇所 |
|---|---|---|
| モンスター・ボス | [MONSTER_ADD_GUIDE.md](MONSTER_ADD_GUIDE.md) | `monsters.js` / `monTraits.js` |
| アイテム全般 | [ITEM_ADD_GUIDE.md](ITEM_ADD_GUIDE.md) | `items.js` / `useItemActions.js` |
| 罠 | [TRAP_ADD_GUIDE.md](TRAP_ADD_GUIDE.md) | `items.js` / `traps.js` |
| 杖・ペン・魔法書 | [WAND_PEN_MAGIC_ADD_GUIDE.md](WAND_PEN_MAGIC_ADD_GUIDE.md) | `items.js` / `wands.js` / `useItemActions.js` |
| 泉・大箱・魔方陣・石像など | [FLOOR_OBJECT_ADD_GUIDE.md](FLOOR_OBJECT_ADD_GUIDE.md) | `dungeon.js` / `fixtures.js` |
| 食料・料理 | [FOOD_ADD_GUIDE.md](FOOD_ADD_GUIDE.md) | `foodData.js` / `foodDescriptions.js` |
| フロア・ダンジョン | [DUNGEON_ADD_GUIDE.md](DUNGEON_ADD_GUIDE.md) | `dungeon.js` / `Game.jsx` |
| スプライト・タイル | [GRAPHICS_ADD_GUIDE.md](GRAPHICS_ADD_GUIDE.md) | `render.js` / `tilesetMap.js` |

## 共通の作業順

### 1. 先に仕様を決める

- `AGENTS.md` と `CLAUDE.md` の開発ルールを読む。
- `SPEC.md` の関連する章を読む。
- 名前、内部キー、出現条件、効果、祝福・呪い、識別、図鑑表示、セーブ互換、画像の有無を決める。
- 既存の似たコンテンツを1つ選び、定義からテストまで追う。

### 2. 定義と実体を分ける

- 配列に置く定義はテンプレートとして扱う。
- 実際に生成する個体・アイテムには `id: uid()` を付け、必要な状態をコピーしてから座標などを設定する。
- 表示名を内部キーにしない。`baseKind`、`effect`、`potEffect`、`kind` などの安定したキーを使う。
- 既存セーブに存在しない新しいフィールドは、ロード時に無くても動くデフォルトを用意する。

### 3. すべての入口を確認する

次のうち該当するものを漏れなく更新する。

- 通常生成・特殊フロア・ボスフロア・店・壁掘り・召喚・変化・石像報酬
- 通常使用・投擲・敵使用・破壊時・泉・大箱・魔方陣
- スタイル1／2／3の表示、フォールバック画像
- インベントリ・床一覧・調べる・図鑑・初遭遇ミニ解説
- 識別キー・偽名・祝呪表示・図鑑の個体計上
- セーブ／ロード・旧セーブ・コピーや変化後の状態

### 4. 説明を二系統で書く

- ゲーム内説明は短くする。`items.js` の `desc`、`monsters.js` の `desc` など。
- 実装の全詳細は `generate_final_guide.js` の `GUIDE_DESC_OVERRIDES`、`monTraits()`、各ガイド表へ書く。
- コンテンツを追加・変更したら `node generate_final_guide.js` を実行し、`ローグゲーム完全実装ガイド.xlsx` も更新する。

### 5. テストを書く

最低限、次を固定する。

- 定義が正しいこと、生成候補に入る／入らないこと
- 通常時と祝福・呪い時の差
- 隣接・遠距離・壁・水・罠・石像など代表的な境界条件
- 封印・魔封じ・重力・聖域など既存システムとの相互作用
- 図鑑計上が同じ個体で1回だけになること
- セーブ・ロード後に必要な状態が維持されること

テストは `tests/<機能名>.test.js` に置き、乱数が関係する場合は `vi.spyOn(Math, "random")` または `createSeededRng()` を使って再現可能にする。

## 確認コマンド

```bash
node generate_final_guide.js
npm test -- tests/<追加機能>.test.js
npm test
npm run build
git diff --check
```

挙動変更を含む場合は、関連テストだけで終わらせず全テストと本番ビルドまで確認する。

## 依存方向の注意

- `items.js` は `monsters.js` を直接 import しない。敵に関する処理は `monsterRuntime.js` の実行時ポートを使う。
- `fixtures.js` は `items.js` を直接 import しない。必要な依存は `getFixtureItemDeps()` などで呼び出し側から渡す。
- 杖の効果は `wands.js`、罠の発動は `traps.js`／`items.js`、UI上の状態更新は `Game.jsx`／`useItemActions.js` の責務を確認する。
- 既存の処理順を変えると、敵フェーズ・図鑑計上・アニメーション・セーブが壊れやすい。処理を移す場合は先にテストで現在の順序を固定する。

## 完了条件

- カテゴリ別マニュアルのチェック項目を完了している。
- `SPEC.md` に恒久的な仕様を追記している。
- ゲーム内説明と実装ガイドの詳細が矛盾していない。
- 画像が必要なら全スタイルの表示またはフォールバックを確認している。
- 関連テスト、全テスト、ビルドが成功している。
- 変更内容を1つのまとまりとしてコミットしている。
