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

export function speedUpSynthMonster(monster, messages) {
  const previousSpeed = monster.speed || 0.5;
  monster.speed = Math.min(3, previousSpeed + 0.5);
  monster.maxAttacks = Math.ceil(monster.speed);
  if (monster.speed !== previousSpeed) {
    messages.push(`${monster.name}の動きが速くなった！(速度${monster.speed})`);
  }
}
