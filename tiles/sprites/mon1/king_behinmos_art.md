# キングベヒんもス（タイル224）

`tile_224.png` は組み込みの画像生成ツールで作成した透過PNG。共通画像は `public/tiles/king_behinmos.png`。1254×1254の原画を、ダンジョンでは3×3マス、図鑑では1枠に縮小表示する。

生成指示の要点：日本語ローグライク向けの紫色の四足の巨大な獣。太い肩、象牙色の大きな角とたてがみ、爪、太い尾。正面寄りの斜め向き。既存の親しみやすいRPGドット絵に合わせ、太い輪郭と読みやすい陰影。背景は完全透過、1体のみ、文字・UI・枠・武器・背景は入れない。3×3タイル、幅96pxでの表示を想定。

使用した生成指示全文（組み込みツール、背景透過指定）：

```text
Edit the existing King Behinmos sprite, using two existing monster tiles as style references. Keep the recognizable purple four-legged beast, huge ivory horns, pale mane, orange eyes, claws, and thick tail. Redraw it as a compact retro pixel-art sprite that belongs beside the reference monsters: low-resolution pixel clusters, crisp stepped edges, limited palette, bold dark outline, simple readable shapes, restrained highlights, and no smooth digital painting, antialiasing, or 3D rendering. Use a slightly elevated three-quarter game-sprite view, facing forward, centered, with the full creature visible and a strong silhouette. Preserve the transparent background. No ground, text, frame, or extra objects. Make it legible across a 3×3 dungeon footprint; do not crop its horns, claws, mane, or tail.
```
