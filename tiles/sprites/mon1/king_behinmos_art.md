# キングベヒんもス（タイル224）

`tile_224.png` は組み込みの画像生成ツールで作成した透過PNG。共通画像は `public/tiles/king_behinmos.png`。1254×1254の原画を、ダンジョンでは3×3マス、図鑑では1枠に縮小表示する。

生成指示の要点：日本語ローグライク向けの紫色の四足の巨大な獣。太い肩、象牙色の大きな角とたてがみ、爪、太い尾。正面寄りの斜め向き。既存の親しみやすいRPGドット絵に合わせ、太い輪郭と読みやすい陰影。背景は完全透過、1体のみ、文字・UI・枠・武器・背景は入れない。3×3タイル、幅96pxでの表示を想定。

使用した生成指示全文（組み込みツール、背景透過指定）：

```text
Use case: stylized-concept
Asset type: transparent PNG monster sprite for a Japanese top-down roguelike, a single giant boss named キングベヒんもス.
Primary request: one imposing king behemoth, a bulky four-legged horned beast with deep purple hide, huge shoulders, a cream-colored mane, two massive curved ivory horns, heavy clawed paws and a thick tail. Its expression is fierce but appealing and slightly comical, suitable for a playful roguelike. Ready to cast Meteor, subtle orange glow in its eyes.
Style/medium: clean polished retro RPG pixel sprite, thick dark outlines, restrained pixel clusters, crisp readable shading. Match the charming small retro RPG monster aesthetic in the recent example, with a much broader and heavier silhouette.
Composition/framing: full body, facing downward toward the viewer in slight three-quarter perspective. Square image, body fills most of canvas, all horns, paws and tail inside bounds, minimal 4% padding. One monster only.
Scene/backdrop: genuinely transparent background, no floor, no colored square, no cast shadow extending beyond silhouette.
Constraints: no text, no UI, no frame, no additional creatures, no weapons or accessories, no background. Preserve transparency. Intended to be displayed across a 3-by-3-tile 96-pixel-wide area.
```
