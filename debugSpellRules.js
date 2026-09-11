export const DEBUG_ITEM_GET_EFFECTS = Object.freeze({
  normal: "debug_get_item",
  blessed: "debug_get_blessed_item",
  cursed: "debug_get_cursed_item",
});

const DEBUG_ITEM_GET_EFFECT_SET = new Set(Object.values(DEBUG_ITEM_GET_EFFECTS));

export function isDebugItemGetEffect(effect) {
  return DEBUG_ITEM_GET_EFFECT_SET.has(effect);
}

export function prepareDebugItem(template, effect, id) {
  const item = { ...template, id, fullIdent: true, bcKnown: true };
  if (effect === DEBUG_ITEM_GET_EFFECTS.blessed) {
    item.blessed = true;
    item.cursed = false;
  } else if (effect === DEBUG_ITEM_GET_EFFECTS.cursed) {
    item.blessed = false;
    item.cursed = true;
  }
  return item;
}
