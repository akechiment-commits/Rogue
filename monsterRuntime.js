/**
 * items.js からモンスター実装を直接importしないための実行時ポート。
 * monsters.js が初期化時に実装を登録する。
 */
let runtime = null;

export function registerMonsterRuntime(implementation) {
  runtime = implementation;
}

function requireRuntime(name) {
  const implementation = runtime?.[name];
  if (!implementation) {
    throw new Error(`モンスター実装 "${name}" が未登録です`);
  }
  return implementation;
}

export function getMonsterCatalog() {
  return requireRuntime("getMonsterCatalog")();
}

export function pickTransformMonsterDef(...args) {
  return requireRuntime("pickTransformMonsterDef")(...args);
}

export function spawnMonsters(...args) {
  return requireRuntime("spawnMonsters")(...args);
}

export function monLevelUp(...args) {
  return requireRuntime("monLevelUp")(...args);
}

export function monLevelDown(...args) {
  return requireRuntime("monLevelDown")(...args);
}

export function wakeIfDormant(monster, messages) {
  if (monster.dormantHouse) {
    monster.dormantHouse = false;
    monster.aware = true;
    messages.push(`${monster.name}が目を覚ました！`);
    return;
  }
  if (!monster.dormant) return;
  monster.dormant = false;
  monster._dormantTouched = false;
  delete monster._dormantHp;
  messages.push(`${monster.name}が目を覚ました！`);
}

export function resolveMonsterBolt(...args) {
  return requireRuntime("resolveMonsterBolt")(...args);
}

export function findMonsterRoom(...args) {
  return requireRuntime("findMonsterRoom")(...args);
}

export function scaleMonsterFireDamage(...args) {
  return requireRuntime("scaleMonsterFireDamage")(...args);
}

export function monsterFireDamageLabel(...args) {
  return requireRuntime("monsterFireDamageLabel")(...args);
}
