import { useState, useEffect } from "react";
import { soundEngine } from "./soundEngine.js";
import { ALL_BGM_TRACKS, ALL_SE_LIST } from "./musicData.js";
import { updateDungeonBgm, playDirectBgm, triggerSE, unlockAudio } from "./soundEvents.js";

/**
 * Sound settings and Jukebox / Sound Test modal.
 */
export default function SoundModal({ isOpen, onClose, gameState }) {
  const [bgmVol, setBgmVol] = useState(soundEngine.bgmVolume);
  const [seVol, setSeVol] = useState(soundEngine.seVolume);
  const [isMuted, setIsMuted] = useState(soundEngine.isMuted);
  const [activeTab, setActiveTab] = useState("bgm"); // "bgm" | "se"
  const [playingBgmName, setPlayingBgmName] = useState(soundEngine.currentBgmName);

  useEffect(() => {
    if (isOpen) {
      unlockAudio();
      setBgmVol(soundEngine.bgmVolume);
      setSeVol(soundEngine.seVolume);
      setIsMuted(soundEngine.isMuted);
      setPlayingBgmName(soundEngine.currentBgmName);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBgmChange = (e) => {
    const val = parseFloat(e.target.value);
    setBgmVol(val);
    soundEngine.setBgmVolume(val);
  };

  const handleSeChange = (e) => {
    const val = parseFloat(e.target.value);
    setSeVol(val);
    soundEngine.setSeVolume(val);
  };

  const handleMuteToggle = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  const handlePlayBgm = (track) => {
    unlockAudio();
    if (soundEngine.currentBgmName === track.name && soundEngine.isPlayingBgm) {
      soundEngine.stopBGM();
      setPlayingBgmName(null);
    } else {
      playDirectBgm(track);
      setPlayingBgmName(track.name);
    }
  };

  const handlePlaySe = (seId) => {
    unlockAudio();
    triggerSE(seId);
  };

  const handleRestoreGameBgm = () => {
    unlockAudio();
    updateDungeonBgm(gameState);
    setPlayingBgmName(soundEngine.currentBgmName);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerSE("cancel");
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "#1a1c23",
          border: "2px solid #b8860b",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          color: "#eee",
          boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            background: "#242733",
            borderBottom: "1px solid #444",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.2rem" }}>🎵</span>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#ffd700" }}>サウンド設定 & サウンドテスト</h3>
          </div>
          <button
            onClick={() => {
              triggerSE("cancel");
              onClose();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Volume Controls */}
        <div
          style={{
            padding: "12px 16px",
            background: "#161820",
            borderBottom: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "0.9rem", color: "#ccc", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>BGM音量:</span>
              <span style={{ color: "#ffd700", width: "40px" }}>{Math.round(bgmVol * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={bgmVol}
              onChange={handleBgmChange}
              style={{ width: "60%", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "0.9rem", color: "#ccc", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>SE音量:</span>
              <span style={{ color: "#ffd700", width: "40px" }}>{Math.round(seVol * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={seVol}
              onChange={handleSeChange}
              style={{ width: "60%", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
            <button
              onClick={handleMuteToggle}
              style={{
                background: isMuted ? "#8b0000" : "#2a3b2a",
                border: "1px solid " + (isMuted ? "#ff4444" : "#44aa44"),
                color: "#fff",
                borderRadius: "4px",
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {isMuted ? "🔇 ミュート中（クリックで解除）" : "🔊 サウンドON（クリックでミュート）"}
            </button>

            <button
              onClick={handleRestoreGameBgm}
              style={{
                background: "#2a2d3d",
                border: "1px solid #555",
                color: "#aaa",
                borderRadius: "4px",
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              フロアBGMに戻す
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div style={{ display: "flex", borderBottom: "1px solid #333", background: "#20232e" }}>
          <button
            onClick={() => {
              triggerSE("cursor");
              setActiveTab("bgm");
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: activeTab === "bgm" ? "#1a1c23" : "transparent",
              border: "none",
              borderBottom: activeTab === "bgm" ? "2px solid #ffd700" : "none",
              color: activeTab === "bgm" ? "#ffd700" : "#888",
              cursor: "pointer",
              fontWeight: activeTab === "bgm" ? "bold" : "normal",
            }}
          >
            🎼 BGM ジュークボックス ({ALL_BGM_TRACKS.length}曲)
          </button>
          <button
            onClick={() => {
              triggerSE("cursor");
              setActiveTab("se");
            }}
            style={{
              flex: 1,
              padding: "10px",
              background: activeTab === "se" ? "#1a1c23" : "transparent",
              border: "none",
              borderBottom: activeTab === "se" ? "2px solid #ffd700" : "none",
              color: activeTab === "se" ? "#ffd700" : "#888",
              cursor: "pointer",
              fontWeight: activeTab === "se" ? "bold" : "normal",
            }}
          >
            🔊 効果音（SE）テスト ({ALL_SE_LIST.length}種)
          </button>
        </div>

        {/* Content list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {activeTab === "bgm" ? (
            ALL_BGM_TRACKS.map((track) => {
              const isPlaying = playingBgmName === track.name && soundEngine.isPlayingBgm;
              return (
                <div
                  key={track.name}
                  style={{
                    padding: "10px 14px",
                    background: isPlaying ? "#2b2e40" : "#222530",
                    border: isPlaying ? "1px solid #ffd700" : "1px solid #383c4a",
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ flex: 1, marginRight: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "bold", color: isPlaying ? "#ffd700" : "#eee" }}>
                        {track.title}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "#888", background: "#181a22", padding: "2px 6px", borderRadius: "3px" }}>
                        BPM {track.tempo}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#aaa", marginTop: "3px" }}>
                      {track.desc}
                    </div>
                  </div>
                  <button
                    onClick={() => handlePlayBgm(track)}
                    style={{
                      background: isPlaying ? "#b8860b" : "#3b4252",
                      border: "none",
                      color: "#fff",
                      padding: "6px 14px",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isPlaying ? "⏹ 停止" : "▶ 再生"}
                  </button>
                </div>
              );
            })
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
              {ALL_SE_LIST.map((se) => (
                <button
                  key={se.id}
                  onClick={() => handlePlaySe(se.id)}
                  style={{
                    background: "#222530",
                    border: "1px solid #383c4a",
                    color: "#ddd",
                    padding: "10px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ffd700")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#383c4a")}
                >
                  <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#fff" }}>
                    🔔 {se.name}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#888" }}>
                    {se.desc}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            background: "#161820",
            borderTop: "1px solid #333",
            textAlign: "right",
          }}
        >
          <button
            onClick={() => {
              triggerSE("cancel");
              onClose();
            }}
            style={{
              background: "#3b4252",
              border: "1px solid #555",
              color: "#eee",
              padding: "6px 18px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
