# Rogue 開発ルール

## セッション開始時に必ず実行すること

```bash
git fetch --all
git log --all --date-order --oneline -15
```

タスク指示のブランチより新しいコミットが別ブランチにある場合は、そのブランチの最新ファイルをベースに作業すること。指示ブランチへのプッシュは引き続き行ってよい。

## 1つずつコミット

**複数タスクを同時にやるな。** `1つ変更 → コミット → プッシュ` のサイクルを守れ。

## ガイドの連動更新

ゲームのアイテム・敵・罠などに変更があった場合は、必ず `ローグゲーム完全実装ガイド.xlsx`（`generate_final_guide.js` を編集して再生成）も同時に更新すること。

---

## ビジュアルスタイルの仕組み（重要）

ゲームには3種類のビジュアルスタイルがある。

| スタイル | 名称 | グラフィックの場所 | 説明 |
|---|---|---|---|
| 1 | デフォルト(ASCII) | `render.js` の `TILE_RENDER` | テキスト文字で描画 |
| 2 | DawnLike | `public/tiles/` | 旧来のスプライトシート切り出し |
| 3 | mon1 | `tiles/sprites/mon1/tile_${id}.png` | 個別PNG、ルートの `tiles/` に保存 |

### スタイル3（mon1）のファイル配信

`tiles/` はルートにありViteの `public/` 配下ではないため、`vite.config.js` のカスタムプラグインで配信している。

- **開発時**: `/tiles/...` へのリクエストをルートの `tiles/` から配信（`public/tiles/` が優先）
- **ビルド時**: `closeBundle()` で `dist/tiles/` にコピー

`public/tiles/` にファイルが存在する場合はそちらが優先される点に注意。

### バーチャルタイルID（スタイル3専用）

スタイル3では、アイテムの外見を冒険ごとにランダム化するためにバーチャルIDを使う。

| 範囲 | 用途 | 画像ソース |
|---|---|---|
| 2001〜2009 | ペン（9種） | `tiles/items/item_r01_c01〜c09.png` |
| 3001〜3025 | 薬（25種） | `tiles/items/item_r04_c07` 等（後述） |

画像は `Game.jsx` の `useEffect([currentTileset])` ブロックで mon1 選択時のみ読み込まれ、`customTileImages[idx]` に格納される。

**スタイル1/2ではバーチャルIDの画像は読み込まれない。**  
レンダラー（`useGameRenderer.js`）でバーチャルIDを返す前に必ず `customTileImages[vi]` の存在確認を行うこと：

```js
// 正しい実装（画像未ロード時は元のtile IDにフォールバック）
const _potTile = (it) => {
  const vi = 3000 + _potMap?.[it.effect];
  return ((it.tile === 16 || it.tile === 17) && it.type === 'potion'
    && _potMap?.[it.effect] != null && customTileImages[vi]) ? vi : it.tile;
};
```

### ペン・薬のランダム化

- **ランダムマップ**: `session.penSpriteMap`（effect→1〜9）、`session.potionSpriteMap`（effect→1〜25）
- **初期化**: `init()` 内で冒険開始時にランダム生成、`GameSave.js` で保存・復元
- **特例**: tile 42（ペン基本タイル）は `loadTileset('mon1')` でスキップして、penSpriteMap の上書きが消えないようにしている

### 新しいバーチャルタイルIDを追加する場合の手順

1. `Game.jsx` の `useEffect([currentTileset])` ブロックに画像読み込みを追加（mon1 専用）
2. `useGameRenderer.js` の `_spriteTile` 系ヘルパーを更新
3. `Game.jsx` の `init()` と resume パスに対応するスプライトマップを追加
4. `GameSave.js` の save/load 両方に追加
5. **必ず** `customTileImages[vi]` 存在チェックをつけてスタイル1/2で壊れないようにする

### 薬スプライトプール（potionSpriteMap インデックス→ファイル名）

```
1=item_r04_c07  2=item_r04_c10  3=item_r04_c11  4=item_r04_c14
5=item_r05_c01  6=item_r05_c02  7=item_r05_c03  8=item_r05_c04
9=item_r05_c05  10=item_r05_c06 11=item_r05_c08 12=item_r05_c12 13=item_r05_c14
14=item_r03_c01 15=item_r03_c02 16=item_r03_c03 17=item_r03_c04
18=item_r03_c05 19=item_r03_c15
20=item_r04_c01 21=item_r04_c02 22=item_r04_c03 23=item_r04_c04
24=item_r04_c05 25=item_r04_c06
```
