function abilityNames(item, abilities) {
  const ids = [...new Set([...(item.abilities || []), ...(item.ability ? [item.ability] : [])].filter(Boolean))];
  return ids.map((id) => abilities.find((ability) => ability.id === id)?.name).filter(Boolean);
}

/** 強化値を符号付きで表示する（負値は「+-1」ではなく「-1」）。 */
export function formatPlusSuffix(plus) {
  const value = Number(plus) || 0;
  return value === 0 ? "" : `${value > 0 ? "+" : ""}${value}`;
}

/** インベントリに表示する1アイテム分のラベルを組み立てる。 */
export function formatInventoryItem(item, {
  player,
  identified,
  displayName,
  getIdentKey,
  weaponAbilities,
  armorAbilities,
  potOccupancyCount,
  getShopItemCharge,
}) {
  const equipped = player?.weapon === item ? "【武器】"
    : player?.armor === item ? "【防具】"
      : player?.arrow === item ? "【矢】"
        : (player?.rings || []).includes(item) ? "【指輪】" : "";
  const identKey = getIdentKey(item);
  const isIdentified = !identKey || identified?.has(identKey);
  const needsFullIdentification = !!identKey || ["weapon", "armor", "ring", "food"].includes(item.type);
  const showBlessCurse = needsFullIdentification ? (item.fullIdent || item.bcKnown) : true;
  const blessCurse = showBlessCurse ? (item.blessed ? "【祝】" : item.cursed ? "【呪】" : "") : "";
  let label = equipped + blessCurse + displayName(item);

  if (item.type === "arrow") {
    label += ` (${item.count}${(item.stone || item.magicStone) ? "個" : "本"})`;
  } else if (item.type === "weapon") {
    label += formatPlusSuffix(item.plus);
    label += ` (攻+${item.atk + (item.plus || 0)})`;
    const names = abilityNames(item, weaponAbilities);
    if (names.length) label += ` [${names.join("・")}]`;
  } else if (item.type === "armor") {
    label += formatPlusSuffix(item.plus);
    label += ` (防+${item.def + (item.plus || 0)})`;
    const names = abilityNames(item, armorAbilities);
    if (names.length) label += ` [${names.join("・")}]`;
  } else if (item.type === "potion" && (item.effect === "heal" || item.effect === "heal_big") && isIdentified) {
    label += ` (HP+${item.value})`;
  } else if (item.type === "food") {
    const rotMultiplier = item.rotten ? 0.3 : 1;
    label += `(満+${Math.max(1, Math.round(item.value * rotMultiplier))})`;
    if (item.rotten || !item.cooked || item.potionEffects?.length) {
      label += "(";
      if (item.rotten) label += "腐";
      else if (!item.cooked) label += "生";
      if (item.potionEffects?.length) label += "★";
      label += ")";
    }
  } else if (item.type === "wand") {
    label += item.fullIdent ? ` [${item.charges}回]` : (!isIdentified && item._usedCount ? ` (-${item._usedCount})` : "");
  } else if (item.type === "marker") {
    label += ` [${item.charges}回]`;
  } else if (item.type === "pen") {
    label += item.fullIdent ? ` [${item.charges || 0}回]` : "";
  } else if (item.type === "pot") {
    label += isIdentified ? ` [${potOccupancyCount(item)}/${item.capacity}]` : "";
  } else if (item.type === "ring" && ["power_ring", "defense_ring", "life_ring"].includes(item.effect)) {
    label += `+${item.plus || 0}`;
  }
  if (item.shopPrice) label += ` 〔未払:${getShopItemCharge(item)}G〕`;
  return label;
}
