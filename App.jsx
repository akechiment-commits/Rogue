import { useState, useCallback, useRef } from "react";
import { loadSave, writeSave, clearSave, mergeDiscoveries } from "./SaveData.js";
import { resetDiscoveries } from "./DiscoveryTracker.js";
import { loadGameState, clearGameSave } from "./GameSave.js";
import { mergeReturnItemsToWarehouse } from "./hubWarehouse.js";
import { rollHubShopStock } from "./hubShop.js";
import { submitRunResult, RANKING_DUNGEON_IDS } from "./rankingClient.js";
import RoguelikeGame from "./Game.jsx";
import HubScreen from "./HubScreen.jsx";

/* ===== TOP-LEVEL SCREEN ROUTER ===== */
export default function App() {
  const [screen, setScreen] = useState("hub"); /* "hub" | "dungeon" */
  const [saveData, setSaveData] = useState(() => loadSave());
  const [dungeonConfig, setDungeonConfig] = useState(null);
  const [resumeState, setResumeState] = useState(null);
  const returnedRef = useRef(false); /* guard: prevent double returnToHub */

  /* Persist and update saveData */
  const updateSave = useCallback((updater) => {
    setSaveData(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      writeSave(next);
      return next;
    });
  }, []);

  /* Hub → Dungeon */
  const startDungeon = useCallback((config) => {
    resetDiscoveries();
    clearGameSave();
    returnedRef.current = false;
    setResumeState(null);
    setDungeonConfig({ ...config, _key: Date.now() });
    /* 持参アイテムをダンジョンに移したのでhubInventoryをクリア */
    updateSave(prev => ({ ...prev, hubInventory: [] }));
    setScreen("dungeon");
  }, [updateSave]);

  /* Hub → Dungeon (resume from save) */
  const resumeDungeon = useCallback(() => {
    const saved = loadGameState();
    if (!saved) return;
    returnedRef.current = false;
    setResumeState(saved);
    setDungeonConfig({ ...(saved.dungeonConfig || {}), _key: Date.now() });
    setScreen("dungeon");
  }, []);

  /* Dungeon → Hub (called on death OR voluntary exit) */
  const returnToHub = useCallback((result) => {
    /* 二重呼び出し防止 */
    if (returnedRef.current) return;
    returnedRef.current = true;
    const rankPlayerId = saveData?.playerId || "";
    const rankPlayerName = saveData?.playerName || "";
    updateSave(prev => {
      const next = { ...prev };
      /* survived=true: 100% gold; death: 50% gold */
      const goldRate = result.survived ? 1.0 : 0.5;
      next.hubGold = (prev.hubGold || 0) + Math.floor((result.earnedGold || 0) * goldRate);
      next.totalRuns = (prev.totalRuns || 0) + 1;
      next.bestDepth = Math.max(prev.bestDepth || 0, result.depth || 0);
      next.bestGold  = Math.max(prev.bestGold  || 0, result.earnedGold || 0);
      /* Merge encyclopedia discoveries */
      next.discovered = mergeDiscoveries(prev.discovered, result.discoveries || {});
      /* 識別済み巻物・魔法書エフェクトを永続保存（魔法の筆用） */
      if (result.identifiedEffects?.length) {
        const _prev = new Set(prev.identifiedEffects || []);
        for (const e of result.identifiedEffects) _prev.add(e);
        next.identifiedEffects = [..._prev];
      }
      /* Voluntary exit: carry items to warehouse (goal items excluded) */
      if (result.survived && result.returnItems?.length) {
        const merged = mergeReturnItemsToWarehouse(
          prev.warehouse,
          prev.warehouseMax || 100,
          result.returnItems,
        );
        next.warehouse = merged.warehouse;
      }
      /* 拠点ショップを入荷（帰還のたびに1点） */
      next.hubShopStock = rollHubShopStock();
      /* ダンジョンクリア記録（オブジェクトを新規生成して prev の参照を共有しない） */
      if (result.cleared) {
        const _dt = dungeonConfig?.dungeonType || result.dungeonType || "beginner";
        next.clearedDungeons = { ...(prev.clearedDungeons || {}), [_dt]: true };
      }
      return next;
    });
    /* オンラインランキング投稿（失敗しても進行は止めない） */
    const dungeonType = result.dungeonType || dungeonConfig?.dungeonType || "beginner";
    if (
      rankPlayerId &&
      rankPlayerName &&
      RANKING_DUNGEON_IDS.includes(dungeonType)
    ) {
      submitRunResult({
        playerId: rankPlayerId,
        playerName: rankPlayerName,
        dungeonType,
        score: result.score ?? 0,
        turns: result.turns ?? 0,
        elapsedMs: result.elapsedMs ?? 0,
        depth: result.depth ?? 0,
        level: result.level ?? 0,
        cleared: !!result.cleared,
        survived: !!result.survived,
        cause: result.cause || "",
        gold: result.gold ?? result.earnedGold ?? 0,
        itemsValue: result.itemsValue ?? 0,
      }).catch(() => {});
    }
    setScreen("hub");
  }, [updateSave, dungeonConfig, saveData?.playerId, saveData?.playerName]);

  const handleClearSave = useCallback(() => {
    clearSave();
    clearGameSave();
    setSaveData(loadSave());
  }, []);

  if (screen === "dungeon") {
    return (
      <RoguelikeGame
        key={dungeonConfig?._key}
        dungeonConfig={dungeonConfig}
        onReturnToHub={returnToHub}
        pastIdent={saveData?.identifiedEffects || []}
        discoveredItems={saveData?.discovered?.items || {}}
        resumeState={resumeState}
        playerName={saveData?.playerName || ""}
      />
    );
  }

  return (
    <HubScreen
      saveData={saveData}
      updateSave={updateSave}
      onStartDungeon={startDungeon}
      onResumeDungeon={resumeDungeon}
      onClearSave={handleClearSave}
    />
  );
}
