export function ensureSynthMonsterBox(monster) {
  const box = monster.synthBox || {
    kind: "synthesis",
    name: monster.name,
    contents: [],
    capacity: 99,
  };
  box.kind = "synthesis";
  box.name = monster.name;
  box.contents = Array.isArray(box.contents) ? box.contents : [];
  box.capacity = 99;
  box.internalMonsterSynthesis = true;
  monster.synthBox = box;
  return box;
}

export function boostSynthMonster(monster, messages) {
  const previousSpeed = monster.speed || 0.5;
  monster.speed = Math.min(3, previousSpeed + 0.5);
  monster.maxAttacks = Math.ceil(monster.speed);
  if (monster.speed !== previousSpeed) {
    messages.push(`${monster.name}の動きが速くなった！(速度${monster.speed})`);
  }
  if (!monster._synthBaseAtk) monster._synthBaseAtk = monster.atk;
  monster._synthAtkBoost = Math.min(10, (monster._synthAtkBoost || 1) * 1.2);
  monster.atk = Math.round(monster._synthBaseAtk * monster._synthAtkBoost);
  messages.push(`${monster.name}の攻撃力が上がった！（攻撃力×${monster._synthAtkBoost.toFixed(2)}→${monster.atk}）`);
}

export function absorbGelCubeProjectile(monster, item) {
  monster.heldItems ||= [];
  monster.heldItems.push(item);
  if (!monster._gelBaseAtk) monster._gelBaseAtk = monster.atk;
  monster._gelBoost = Math.min(10, (monster._gelBoost || 1) * 1.2);
  monster.atk = Math.round(monster._gelBaseAtk * monster._gelBoost);
  return { boost: monster._gelBoost, attack: monster.atk };
}
