// Static image files that the production game loads by path.
// Keep this list shared by the browser code and Vite's production asset copier.
export const TILESET_SPRITE_DIRECTORIES = ["dawnlike", "mon1"];

export const PEN_ITEM_ASSET_NAMES = Array.from(
  { length: 9 },
  (_, index) => `item_r01_c${String(index + 1).padStart(2, "0")}`,
);

export const POTION_ITEM_ASSET_NAMES = [
  "item_r04_c07", "item_r04_c10", "item_r04_c11", "item_r04_c14",
  "item_r05_c01", "item_r05_c02", "item_r05_c03", "item_r05_c04",
  "item_r05_c05", "item_r05_c06", "item_r05_c08", "item_r05_c12", "item_r05_c14",
  "item_r03_c01", "item_r03_c02", "item_r03_c03", "item_r03_c04",
  "item_r03_c05", "item_r03_c15",
  "item_r04_c01", "item_r04_c02", "item_r04_c03", "item_r04_c04",
  "item_r04_c05", "item_r04_c06",
];
