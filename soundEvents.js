/**
 * Sound Events coordinator.
 * Bridges game state changes, player actions, animations, and messages to the SoundEngine.
 */

import { soundEngine } from "./soundEngine.js";
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
export function updateDungeonBgm(gameState) {
  if (!gameState) return;

  // 1. Game Over
  if (gameState.isGameOver || gameState.player?.hp <= 0 || gameState.gameOverView) {
    soundEngine.playBGM(BGM_GAMEOVER);
    return;
  }

  // 2. Game Clear
  if (gameState.isGameClear || gameState.gameClear || gameState.endingView) {
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
  if (dg.isMonsterHouseActive) {
    soundEngine.playBGM(BGM_MONSTER_HOUSE);
    return;
  }

  // 5. Shop room
  const pl = gameState.pl || gameState.player;
  if (pl && dg.rooms) {
    const curRoom = dg.rooms.find(r => pl.x >= r.x && pl.x < r.x + r.w && pl.y >= r.y && pl.y < r.y + r.h);
    if (curRoom && curRoom.isShop) {
      soundEngine.playBGM(BGM_SHOP);
      return;
    }
  }

  // 6. Deep vs Shallow dungeon floors
  const depth = dg.depth || 1;
  const maxDepth = dg.maxDepth || 30;
  if (depth >= Math.max(12, Math.floor(maxDepth * 0.45))) {
    soundEngine.playBGM(BGM_DUNGEON_DEEP);
  } else {
    soundEngine.playBGM(BGM_DUNGEON_SHALLOW);
  }
}

/**
 * Trigger sound effects by name.
 */
export function triggerSE(name) {
  soundEngine.playSE(name);
}

/**
 * Analyzes newly generated message log entries and triggers appropriate SEs.
 */
export function processActionMessages(newMsgs) {
  if (!newMsgs || !newMsgs.length) return;

  // Check from newest to oldest for the most prominent sound event
  for (let i = newMsgs.length - 1; i >= 0; i--) {
    const msg = String(newMsgs[i]);

    if (msg.includes("レベルアップ！")) {
      triggerSE("levelUp");
      return;
    }
    if (msg.includes("倒した！") || msg.includes("撃破")) {
      triggerSE("defeat");
      return;
    }
    if (msg.includes("会心の一撃") || msg.includes("痛恨の一撃") || msg.includes("強烈な一撃")) {
      triggerSE("crit");
      return;
    }
    if (msg.includes("外れた") || msg.includes("かわした") || msg.includes("命中しなかった")) {
      triggerSE("miss");
      return;
    }
    if (msg.includes("割れてしまった") || msg.includes("割れた") || msg.includes("粉々に")) {
      triggerSE("shatter");
      return;
    }
    if (msg.includes("罠") || msg.includes("作動した") || msg.includes("爆破") || msg.includes("爆発")) {
      triggerSE("trap");
      return;
    }
    if (msg.includes("ゴールドを手に入れた") || msg.includes("Gを手に入れた") || msg.includes("G拾った")) {
      triggerSE("gold");
      return;
    }
    if (msg.includes("拾った") || msg.includes("手に入れた")) {
      triggerSE("pickup");
      return;
    }
    if (msg.includes("食べた") || msg.includes("たいらげた") || msg.includes("口にした")) {
      triggerSE("eat");
      return;
    }
    if (msg.includes("飲んだ") || msg.includes("読んだ") || msg.includes("唱えた")) {
      triggerSE("useItem");
      return;
    }
    if (msg.includes("杖を振った") || msg.includes("魔法") || msg.includes("光弾")) {
      triggerSE("magic");
      return;
    }
    if (msg.includes("投げた") || msg.includes("放った") || msg.includes("射った")) {
      triggerSE("throw");
      return;
    }
    if (msg.includes("降りた") || msg.includes("次の階") || msg.includes("フロアへ進んだ")) {
      triggerSE("stairs");
      return;
    }
    if (msg.includes("ダメージを受けた") || msg.includes("攻撃を受けた") || msg.includes("痛打")) {
      triggerSE("playerDamage");
      return;
    }
    if (msg.includes("ダメージを与えた") || msg.includes("攻撃！")) {
      triggerSE("hit");
      return;
    }
  }
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
  soundEngine.stopBGM();
}

/**
 * Unlock audio on user interaction.
 */
export function unlockAudio() {
  soundEngine.unlock();
}
