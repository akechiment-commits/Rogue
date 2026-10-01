import { classifySoundMessages, snapshotSoundState, soundStateChanges, animationSounds } from "./soundRules.js";
import { getActivePlayerName } from "./playerLabel.js";

/**
 * Sound Events coordinator.
 * Bridges game state changes, player actions, animations, and messages to the SoundEngine.
 */

import { soundEngine } from "./soundEngine.js";
import { getShops } from "./utils.js";
import {
  BGM_DUNGEON_SHALLOW,
  BGM_DUNGEON_DEEP,
  BGM_MONSTER_HOUSE,
  BGM_SHOP,
  BGM_BOSS,
  BGM_GAMEOVER,
  BGM_GAMECLEAR,
} from "./musicData.js";

/**
 * Updates the currently playing BGM based on game and dungeon state.
 */
export function updateDungeonBgm(gameState, { gameOver = false, gameClear = false } = {}) {
  if (!gameState) return;

  // 1. Game Over
  if (gameOver || gameState.isGameOver || gameState.player?.hp <= 0 || gameState.gameOverView) {
    soundEngine.playBGM(BGM_GAMEOVER);
    return;
  }

  // 2. Game Clear
  if (gameClear || gameState.isGameClear || gameState.gameClear || gameState.endingView) {
    soundEngine.playBGM(BGM_GAMECLEAR);
    return;
  }

  const dg = gameState.dg || gameState.dungeon;
  if (!dg) return;

  // 3. Boss Floor
  if (dg.isBossFloor || (dg.monsters && dg.monsters.some(m => m && m.isBoss && m.hp > 0))) {
    soundEngine.playBGM(BGM_BOSS);
    return;
  }

  // 4. Monster House triggered / active
  if (dg.isMonsterHouseActive && dg.monsters?.some(monster => monster.monsterHouseMember && monster.hp > 0)) {
    soundEngine.playBGM(BGM_MONSTER_HOUSE);
    return;
  }

  // 5. Shop room
  const pl = gameState.pl || gameState.player;
  if (pl) {
    const inShop = getShops(dg).some(({ room }) => room && pl.x >= room.x && pl.x < room.x + room.w && pl.y >= room.y && pl.y < room.y + room.h);
    if (inShop) {
      soundEngine.playBGM(BGM_SHOP);
      return;
    }
  }

  // 6. Deep vs Shallow dungeon floors
  const depth = pl?.depth || 1;
  const maxDepth = gameState.maxDepth ?? dg.maxFloors ?? 30;
  if (depth >= Math.max(12, Math.floor(maxDepth * 0.45))) {
    soundEngine.playBGM(BGM_DUNGEON_DEEP);
  } else {
    soundEngine.playBGM(BGM_DUNGEON_SHALLOW);
  }
}

const interfaceTimes = new Map();
const queuedAnimationSounds = [];

export function triggerSE(name, { delay = 0 } = {}) {
  const cooldown = ({ cursor: 55, select: 40, cancel: 40, footstep: 70 })[name] || 0;
  const now = performance.now();
  if (cooldown && now - (interfaceTimes.get(name) ?? -Infinity) < cooldown) return;
  if (cooldown) interfaceTimes.set(name, now);
  if (delay > 0) soundEngine.playSE(name, { delay });
  else soundEngine.playSE(name);
}

export function queueAnimationSounds(data) {
  queuedAnimationSounds.push(...animationSounds(data));
}

export function processActionMessages(newMsgs, { playerName = "", explicit = [], changes = [] } = {}) {
  const classified = classifySoundMessages(newMsgs || [], { playerName });
  const movement = classified.includes("teleport") || explicit.some(id => id === "teleport" || id === "knockback" || id === "stairs");
  const filteredChanges = movement ? changes.filter(id => id !== "footstep" && id !== "water") : changes;
  const sounds = new Set([...classified, ...explicit, ...filteredChanges]);
  if ((classified.includes("magic") || classified.includes("shoot")) && !classified.includes("throw")) sounds.delete("throw");
  if (sounds.has("crit")) sounds.delete("hit");
  let index = 0;
  for (const id of sounds) triggerSE(id, { delay: Math.min(0.48, index++ * 0.055) });
  return [...sounds];
}

/** 履歴復元は鳴らさず、ログ上限到達後も新規行と実際の状態変化を検出する。 */
export function createMessageSoundObserver(initialMessages = []) {
  let previous = new Set(initialMessages), snapshot = null;
  return (messages, { reset = false, state = null } = {}) => {
    const additions = reset ? [] : messages.filter(message => !previous.has(message));
    previous = new Set(messages);
    const next = snapshotSoundState(state);
    const changes = reset ? [] : soundStateChanges(snapshot, next);
    if (reset || next) snapshot = next;
    const explicit = reset ? [] : queuedAnimationSounds.slice();
    queuedAnimationSounds.length = 0;
    if (!reset) processActionMessages(additions, { playerName: next?.playerName || getActivePlayerName(), explicit, changes });
  };
}

/**
 * Play a specific BGM track directly (e.g. from Sound Test or scene transition)
 */
export function playDirectBgm(track) {
  soundEngine.playBGM(track);
}

/**
 * Stop any currently playing BGM.
 */
export function stopBgm() {
  queuedAnimationSounds.length = 0;
  soundEngine.stopBGM();
}

/**
 * Unlock audio on user interaction.
 */
export function unlockAudio() {
  soundEngine.unlock();
}
