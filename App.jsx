import { useState, useCallback, useRef } from "react";
import { loadSave, writeSave, clearSave, mergeDiscoveries } from "./SaveData.js";
import { resetDiscoveries } from "./DiscoveryTracker.js";
import { sortWarehouseItems } from "./utils.js";
import RoguelikeGame from "./Game.jsx";
import HubScreen from "./HubScreen.jsx";

/* ===== TOP-LEVEL SCREEN ROUTER ===== */
export default function App() {
  const [screen, setScreen] = useState("hub"); /* "hub" | "dungeon" */
  const [saveData, setSaveData] = useState(() => loadSave());
  const [dungeonConfig, setDungeonConfig] = useState(null);
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
    returnedRef.current = false;
    setDungeonConfig({ ...config, _key: Date.now() });
    setScreen("dungeon");
  }, []);

  /* Dungeon → Hub (called on death OR voluntary exit) */
  const returnToHub = useCallback((result) => {
    /* 二重呼び出し防止 */
    if (returnedRef.current) return;
    returnedRef.current = true;
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
      /* 識別済み巻物・魔法書エフェクトを永続保存（魔法のマーカー用） */
      if (result.identifiedEffects?.length) {
        const _prev = new Set(prev.identifiedEffects || []);
        for (const e of result.identifiedEffects) _prev.add(e);
        next.identifiedEffects = [..._prev];
      }
      /* Voluntary exit: carry items to warehouse (goal items excluded) */
      if (result.survived && result.returnItems?.length) {
        const merged = [
          ...(prev.warehouse || []),
          ...result.returnItems.filter(it => it.type !== "goal").map(it => ({ ...it })),
        ].slice(0, prev.warehouseMax || 100);
        next.warehouse = sortWarehouseItems(merged);
      }
      /* ダンジョンクリア記録 */
      if (result.cleared) {
        const _dt = dungeonConfig?.dungeonType || "beginner";
        if (!next.clearedDungeons) next.clearedDungeons = {};
        next.clearedDungeons[_dt] = true;
      }
      return next;
    });
    setScreen("hub");
  }, [updateSave]);

  const handleClearSave = useCallback(() => {
    clearSave();
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
      />
    );
  }

  return (
    <HubScreen
      saveData={saveData}
      updateSave={updateSave}
      onStartDungeon={startDungeon}
      onClearSave={handleClearSave}
    />
  );
}
