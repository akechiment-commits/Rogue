export function getForgeAbilityIds(item) {
  return [...new Set([...(item?.abilities || []), ...(item?.ability ? [item.ability] : [])].filter(Boolean))];
}

export function removeForgeAbility(item, abilityId) {
  const current = getForgeAbilityIds(item);
  if (!item || !abilityId || !current.includes(abilityId)) return false;
  const remaining = current.filter((id) => id !== abilityId);
  if (remaining.length > 0) {
    item.ability = remaining[0];
    if (Array.isArray(item.abilities)) item.abilities = remaining;
  } else {
    delete item.ability;
    delete item.abilities;
  }
  if (abilityId === "pickaxe") delete item.durability;
  item.fullIdent = true;
  return true;
}
