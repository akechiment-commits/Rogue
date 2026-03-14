import { useState, useCallback } from "react";
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
    setDungeonConfig({ ...config, _key: Date.now() });
    setScreen("dungeon");
  }, []);

  /* Dungeon → Hub (called on death OR voluntary exit) */
  const returnToHub = useCallback((result) => {
    /*
      result: {
        earnedGold: number,       -- dungeon gold earned this run
        depth: number,            -- deepest floor reached
        discoveries: object,      -- { items, monsters, traps }
        survived: boolean,        -- false = death, true = voluntary exit
        returnItems: array,       -- items to deposit into warehouse (voluntary exit only)
      }
    */
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
      /* Voluntary exit: carry items to warehouse */
      if (result.survived && result.returnItems?.length) {
        const merged = [
          ...(prev.warehouse || []),
          ...result.returnItems.map(it => ({ ...it })),
        ].slice(0, prev.warehouseMax || 100);
        next.warehouse = sortWarehouseItems(merged);
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
