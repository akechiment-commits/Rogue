import { useState, useCallback, useEffect, useRef } from "react";
import { loadSave, writeSave, clearSave, mergeDiscoveries } from "./SaveData.js";
import { resetDiscoveries } from "./DiscoveryTracker.js";
import { loadGameState, clearGameSave, hasGameSave } from "./GameSave.js";
import { clampCarryGold, depositDungeonGold, mergeReturnItemsToWarehouse } from "./hubWarehouse.js";
import { rollHubShopStock } from "./hubShop.js";
import { isCarryInRun, isRankableRun, submitRunResult, RANKING_DUNGEON_IDS } from "./rankingClient.js";
import RoguelikeGame from "./Game.jsx";
import HubScreen from "./HubScreen.jsx";

/* ===== TOP-LEVEL SCREEN ROUTER ===== */
export default function App() {
  const [screen, setScreen] = useState("hub"); /* "hub" | "dungeon" */
  const [saveData, setSaveData] = useState(() => loadSave());
  const [dungeonConfig, setDungeonConfig] = useState(null);
  const [resumeState, setResumeState] = useState(null);
  const [hasResumeSave, setHasResumeSave] = useState(null);
  const [saveNotice, setSaveNotice] = useState("");
  const hubActionRef = useRef(false);
  const returnedRef = useRef(false); /* guard: prevent double returnToHub */

  useEffect(() => {
    if (screen !== "hub") return;
    let active = true;
    hasGameSave().then(exists => { if (active) setHasResumeSave(exists); });
    return () => { active = false; };
  }, [screen]);

  /* Persist and update saveData */
  const updateSave = useCallback((updater) => {
    setSaveData(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      writeSave(next);
      return next;
    });
  }, []);

  /* Hub → Dungeon */
  const startDungeon = useCallback(async (config) => {
    if (hasResumeSave === null || hubActionRef.current) return;
    hubActionRef.current = true;
    try {
      if (!(await clearGameSave()) && hasResumeSave) {
        setSaveNotice("中断セーブを消去できませんでした。もう一度お試しください。");
        return;
      }
      resetDiscoveries();
      returnedRef.current = false;
      setResumeState(null);
      setSaveNotice("");
      const startGold = clampCarryGold(saveData.hubGold, config.startGold ?? saveData.carryGold);
      setDungeonConfig({ ...config, startGold, _key: Date.now() });
      /* 持参アイテムをダンジョンに移したのでhubInventoryをクリア */
      updateSave(prev => ({
        ...prev,
        hubGold: Math.max(0, (prev.hubGold || 0) - startGold),
        carryGold: 0,
        hubInventory: [],
      }));
      setScreen("dungeon");
    } finally {
      hubActionRef.current = false;
    }
  }, [hasResumeSave, saveData.carryGold, saveData.hubGold, updateSave]);

  /* Hub → Dungeon (resume from save) */
  const resumeDungeon = useCallback(async () => {
    if (hubActionRef.current) return;
    hubActionRef.current = true;
    try {
      const saved = await loadGameState();
      if (!saved) {
        setHasResumeSave(false);
        setSaveNotice("中断セーブを読み込めませんでした。");
        return;
      }
      returnedRef.current = false;
      setResumeState(saved);
      setSaveNotice("");
      setDungeonConfig({ ...(saved.dungeonConfig || {}), _key: Date.now() });
      setScreen("dungeon");
    } finally {
      hubActionRef.current = false;
    }
  }, []);

  const submitRankingIfEligible = useCallback((result) => {
    if (!isRankableRun(result)) return;
    const rankPlayerId = saveData?.playerId || "";
    const rankPlayerName = saveData?.playerName || "";
    const dungeonType = result.dungeonType || dungeonConfig?.dungeonType || "beginner";
    const carryIn = result.carryIn ?? isCarryInRun(dungeonConfig);
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
        carryIn,
        cause: result.cause || "",
        gold: result.gold ?? result.earnedGold ?? 0,
        itemsValue: result.itemsValue ?? 0,
      }).catch(() => {});
    }
  }, [dungeonConfig, saveData?.playerId, saveData?.playerName]);

  /* 死亡直後に、拠点へ戻らなくても今回の記録を永続化する。 */
  const recordGameOver = useCallback((result) => {
    updateSave(prev => {
      const next = { ...prev };
      next.totalRuns = (prev.totalRuns || 0) + 1;
      next.bestDepth = Math.max(prev.bestDepth || 0, result.depth || 0);
      next.bestGold = Math.max(prev.bestGold || 0, result.earnedGold || 0);
      next.discovered = mergeDiscoveries(prev.discovered, result.discoveries || {});
      if (result.identifiedEffects?.length) {
        const _prev = new Set(prev.identifiedEffects || []);
        for (const e of result.identifiedEffects) _prev.add(e);
        next.identifiedEffects = [..._prev];
      }
      return next;
    });
    submitRankingIfEligible(result);
  }, [submitRankingIfEligible, updateSave]);

  /* Dungeon → Hub (called on death OR voluntary exit) */
  const returnToHub = useCallback(async (result) => {
    /* 二重呼び出し防止 */
    if (returnedRef.current) return;
    returnedRef.current = true;
    const clearedSave = await clearGameSave();
    const _alreadyRecorded = !!result.runRecorded;
    updateSave(prev => {
      const next = { ...prev };
      /* survived=true: 100% gold; death: 50% gold */
      const goldRate = result.survived ? 1.0 : 0.5;
      next.hubGold = depositDungeonGold(prev.hubGold, result.earnedGold, goldRate).bankGold;
      if (!_alreadyRecorded) {
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
      /* 拠点ショップを入荷（帰還のたびに5〜9点） */
      next.hubShopStock = rollHubShopStock();
      /* ダンジョンクリア記録（オブジェクトを新規生成して prev の参照を共有しない） */
      if (result.cleared) {
        const _dt = dungeonConfig?.dungeonType || result.dungeonType || "beginner";
        next.clearedDungeons = { ...(prev.clearedDungeons || {}), [_dt]: true };
      }
      return next;
    });
    /* オンラインランキング投稿（失敗しても進行は止めない） */
    if (!_alreadyRecorded) submitRankingIfEligible(result);
    setHasResumeSave(null);
    setSaveNotice(clearedSave ? "" : "中断セーブを消去できませんでした。");
    setScreen("hub");
  }, [submitRankingIfEligible, updateSave]);

  const handleClearSave = useCallback(async () => {
    if (hubActionRef.current) return;
    hubActionRef.current = true;
    try {
      if (!(await clearGameSave())) {
        setSaveNotice("中断セーブを消去できませんでした。もう一度お試しください。");
        return;
      }
      clearSave();
      setHasResumeSave(false);
      setSaveNotice("");
      setSaveData(loadSave());
    } finally {
      hubActionRef.current = false;
    }
  }, []);

  const markMiniTipSeen = useCallback((key) => {
    if (!key) return;
    updateSave(prev => {
      const seen = new Set(prev.seenMiniTips || []);
      if (seen.has(key)) return prev;
      seen.add(key);
      return { ...prev, seenMiniTips: [...seen] };
    });
  }, [updateSave]);

  if (screen === "dungeon") {
    return (
      <RoguelikeGame
        key={dungeonConfig?._key}
        dungeonConfig={dungeonConfig}
        onReturnToHub={returnToHub}
        onGameOverRecorded={recordGameOver}
        pastIdent={saveData?.identifiedEffects || []}
        discoveredItems={saveData?.discovered?.items || {}}
        resumeState={resumeState}
        playerName={saveData?.playerName || ""}
        favoriteFood={saveData?.favoriteFood || ""}
        seenMiniTips={saveData?.seenMiniTips || []}
        onMiniTipSeen={markMiniTipSeen}
      />
    );
  }

  return (
    <HubScreen
      saveData={saveData}
      hasResumeSave={hasResumeSave}
      saveNotice={saveNotice}
      updateSave={updateSave}
      onStartDungeon={startDungeon}
      onResumeDungeon={resumeDungeon}
      onClearSave={handleClearSave}
    />
  );
}
