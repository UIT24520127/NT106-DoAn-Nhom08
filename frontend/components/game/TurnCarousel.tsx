"use client";
import { useState } from "react";

interface CarouselPlayer {
  userId: string;
  displayName: string;
  role: string;
  isEliminated: boolean;
  descriptionHistory?: string[];
}

interface TurnCarouselProps {
  players: CarouselPlayer[];
  turnOrder: string[];
  currentTurnIndex: number;
  myUserId: string;
  myRole: string;
  myWord: string;
  onSubmitDescription: (word: string) => void;
}

const roleColor: Record<string, string> = {
  Civilian: "#22c55e",
  BlackHat: "#ef4444",
  WhiteHat: "#ffffff",
};

function PlayerAvatar({ name, color, size = 80 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle at 35% 35%, ${color}55, #1a1a2e)`,
      border: `3px solid ${color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 900, color,
      letterSpacing: "0.05em", flexShrink: 0,
      boxShadow: `0 0 16px ${color}55`,
    }}>
      {initials}
    </div>
  );
}

export default function TurnCarousel({
  players,
  turnOrder,
  currentTurnIndex,
  myUserId,
  myRole,
  myWord,
  onSubmitDescription,
}: TurnCarouselProps) {
  const [inputWord, setInputWord] = useState("");
  const [isWordVisible, setIsWordVisible] = useState(false);

  const alivePlayers = players.filter((p) => !p.isEliminated);
  const currentUserId = turnOrder[currentTurnIndex] ?? null;
  const isMyTurn = currentUserId === myUserId;

  // Sắp xếp hiển thị carousel theo turnOrder
  const orderedPlayers = turnOrder
    .map((uid) => alivePlayers.find((p) => p.userId === uid))
    .filter(Boolean) as CarouselPlayer[];

  const handleSubmit = () => {
    if (!inputWord.trim() || !isMyTurn) return;
    onSubmitDescription(inputWord.trim());
    setInputWord("");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0d0d1a 0%, #0a1a0d 50%, #0d0d1a 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "24px 16px",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 50% 50% at 50% 30%, rgba(0,255,0,0.04) 0%, transparent 70%)",
      }} />

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 32, zIndex: 1 }}>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", margin: "0 0 4px" }}>
          Vòng Miêu Tả
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#00ff88", margin: 0, textShadow: "0 0 20px rgba(0,255,136,0.4)" }}>
          {isMyTurn ? "⚡ ĐẾN LƯỢT BẠN!" : `Lượt của ${orderedPlayers[currentTurnIndex]?.displayName ?? "..."}`}
        </h1>
      </div>

      {/* CAROUSEL */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16, width: "100%", maxWidth: 800, zIndex: 1, marginBottom: 32,
        position: "relative",
      }}>
        {orderedPlayers.map((player, idx) => {
          const isActive = idx === currentTurnIndex;
          const isLeft = idx === currentTurnIndex - 1;
          const isRight = idx === currentTurnIndex + 1;
          const visible = isActive || isLeft || isRight;
          if (!visible) return null;

          const color = roleColor[player.role] ?? "#888";
          const scale = isActive ? 1 : 0.78;
          const opacity = isActive ? 1 : 0.45;

          return (
            <div
              key={player.userId}
              style={{
                transform: `scale(${scale})`,
                opacity,
                transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                flexShrink: 0,
                order: isLeft ? 0 : isActive ? 1 : 2,
              }}
            >
              <div style={{
                background: isActive
                  ? "rgba(0,255,136,0.06)"
                  : "rgba(255,255,255,0.02)",
                border: isActive
                  ? "2px solid #00ff88"
                  : "1.5px solid rgba(255,255,255,0.06)",
                borderRadius: 24,
                padding: isActive ? "32px 28px" : "24px 20px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                boxShadow: isActive
                  ? "0 0 40px rgba(0,255,136,0.25), 0 8px 32px rgba(0,0,0,0.5)"
                  : "0 4px 16px rgba(0,0,0,0.3)",
                minWidth: isActive ? 220 : 160,
                backdropFilter: "blur(8px)",
                transition: "all 0.4s ease",
              }}>
                <PlayerAvatar name={player.displayName} color={isActive ? "#00ff88" : (color)} size={isActive ? 88 : 64} />
                <div style={{
                  color: "#fff", fontWeight: 700, fontSize: isActive ? 18 : 14,
                  textAlign: "center",
                }}>
                  {player.displayName}
                  {player.userId === myUserId && (
                    <span style={{ display: "block", fontSize: 11, color: "#e6a822", marginTop: 2 }}>(Bạn)</span>
                  )}
                </div>
                {isActive && (
                  <div style={{
                    padding: "4px 14px", borderRadius: 99,
                    background: "rgba(0,255,136,0.12)",
                    border: "1px solid rgba(0,255,136,0.3)",
                    color: "#00ff88", fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}>
                    🎙️ ĐANG NÓI
                  </div>
                )}

                {/* Lịch sử từ */}
                {player.descriptionHistory && player.descriptionHistory.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", maxWidth: 200 }}>
                    {player.descriptionHistory.slice(-3).map((word, i) => (
                      <span key={i} style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8, padding: "2px 8px",
                        color: "rgba(255,255,255,0.5)", fontSize: 11,
                      }}>
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT — hiện khi đến lượt mình */}
      <div style={{ width: "100%", maxWidth: 560, zIndex: 1 }}>
        {/* Từ khóa bí mật */}
        <div
          onClick={() => setIsWordVisible(!isWordVisible)}
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "1.5px solid rgba(230,168,34,0.25)",
            borderRadius: 14, padding: "10px 18px",
            textAlign: "center", cursor: "pointer",
            color: isWordVisible ? "#e6a822" : "rgba(255,255,255,0.2)",
            fontSize: 15, fontWeight: 700, letterSpacing: "0.05em",
            marginBottom: 12, userSelect: "none",
            transition: "all 0.2s",
            filter: isWordVisible ? "none" : "blur(4px)",
          }}
        >
          {myRole === "WhiteHat"
            ? "Mũ Trắng — Không có từ khóa 🤫"
            : isWordVisible
            ? myWord
            : "••••••• (Bấm để xem)"}
        </div>

        {isMyTurn ? (
          <div style={{ display: "flex", gap: 10 }}>
            <input
              autoFocus
              type="text"
              value={inputWord}
              onChange={(e) => setInputWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Nhập từ miêu tả của bạn..."
              style={{
                flex: 1, padding: "15px 20px",
                background: "rgba(255,255,255,0.06)",
                border: "2px solid rgba(0,255,136,0.4)",
                borderRadius: 16, color: "#fff", fontSize: 16,
                outline: "none", transition: "border 0.2s",
              }}
              onFocus={(e) => (e.target.style.border = "2px solid #00ff88")}
              onBlur={(e) => (e.target.style.border = "2px solid rgba(0,255,136,0.4)")}
            />
            <button
              onClick={handleSubmit}
              disabled={!inputWord.trim()}
              style={{
                padding: "15px 24px", borderRadius: 16, border: "none",
                background: inputWord.trim()
                  ? "linear-gradient(135deg, #00ff88, #00cc66)"
                  : "rgba(255,255,255,0.06)",
                color: inputWord.trim() ? "#000" : "rgba(255,255,255,0.2)",
                fontWeight: 900, fontSize: 15, cursor: inputWord.trim() ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                boxShadow: inputWord.trim() ? "0 4px 16px rgba(0,255,136,0.4)" : "none",
              }}
            >
              GỬI →
            </button>
          </div>
        ) : (
          <div style={{
            textAlign: "center", padding: "16px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16, color: "rgba(255,255,255,0.3)", fontSize: 14,
          }}>
            ⏳ Chờ đến lượt của bạn...
          </div>
        )}
      </div>
    </div>
  );
}
