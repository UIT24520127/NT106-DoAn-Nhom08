"use client";
import { useState } from "react";
import CountdownTimer from "./CountdownTimer";

interface VotePlayer {
  userId: string;
  displayName: string;
  role: string;
  isEliminated: boolean;
  voteCount: number;
  descriptionHistory?: string[];
}

interface VotingGridProps {
  players: VotePlayer[];
  myUserId: string;
  /** Unix ms timestamp khi vote kết thúc */
  voteEndTime: number;
  /** Danh sách voteCount theo userId được cập nhật realtime */
  realtimeVoteCounts: Record<string, number>;
  hasVoted: boolean;
  myVoteTarget: string | null;
  canSkip: boolean;
  isHost: boolean;
  onVote: (targetUserId: string) => void;
  onSkip: () => void;
  onTimerExpired: () => void;
  onShowHistory: (player: VotePlayer) => void;
}

// Màu vai trò
const roleColor: Record<string, string> = {
  Civilian: "#22c55e",
  BlackHat: "#ef4444",
  WhiteHat: "#ffffff",
};
const roleLabel: Record<string, string> = {
  Civilian: "Dân",
  BlackHat: "Mũ Đen",
  WhiteHat: "Mũ Trắng",
};

// Avatar đơn giản từ initials (không cần DiceBear install thêm)
function PlayerAvatar({ name, color, size = 72 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${color}55, #1a1a2e)`,
        border: `3px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 900,
        color: color,
        letterSpacing: "0.05em",
        flexShrink: 0,
        boxShadow: `0 0 12px ${color}55`,
        transition: "box-shadow 0.3s",
      }}
    >
      {initials}
    </div>
  );
}

export default function VotingGrid({
  players,
  myUserId,
  voteEndTime,
  realtimeVoteCounts,
  hasVoted,
  myVoteTarget,
  canSkip,
  isHost,
  onVote,
  onSkip,
  onTimerExpired,
  onShowHistory,
}: VotingGridProps) {
  const [historyPlayer, setHistoryPlayer] = useState<VotePlayer | null>(null);

  const alivePlayers = players.filter((p) => !p.isEliminated);
  const deadPlayers = players.filter((p) => p.isEliminated);

  const handleCardClick = (p: VotePlayer) => {
    onShowHistory(p);
    setHistoryPlayer(p);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 50%, #0d0d1a 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 16px",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(230,168,34,0.07) 0%, transparent 70%)",
      }} />

      {/* HEADER */}
      <div style={{ textAlign: "center", marginBottom: 8, zIndex: 1 }}>
        <p style={{
          color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "0.3em",
          textTransform: "uppercase", margin: "0 0 4px",
        }}>
          Vòng Bình Chọn
        </p>
        <h1 style={{
          fontSize: 28, fontWeight: 900, color: "#e6a822",
          textShadow: "0 0 20px rgba(230,168,34,0.5)",
          margin: "0 0 12px", letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          🗳️ BÌNH CHỌN
        </h1>
        <CountdownTimer endTime={voteEndTime} onExpired={onTimerExpired} />
        {hasVoted && myVoteTarget && (
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 6 }}>
            Bạn đã bầu cho:{" "}
            <span style={{ color: "#e6a822", fontWeight: 700 }}>
              {players.find((p) => p.userId === myVoteTarget)?.displayName}
            </span>
          </p>
        )}
      </div>

      {/* VOTE GRID — Người còn sống */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
          width: "100%",
          maxWidth: 900,
          zIndex: 1,
          marginTop: 8,
        }}
      >
        {alivePlayers.map((player) => {
          const isMe = player.userId === myUserId;
          const isVotedByMe = myVoteTarget === player.userId;
          const votes = realtimeVoteCounts[player.userId] ?? player.voteCount ?? 0;
          const color = roleColor[player.role] ?? "#888";

          return (
            <div
              key={player.userId}
              onClick={() => handleCardClick(player)}
              style={{
                background: isVotedByMe
                  ? "rgba(230,168,34,0.12)"
                  : "rgba(255,255,255,0.04)",
                border: isVotedByMe
                  ? "2px solid #e6a822"
                  : "1.5px solid rgba(255,255,255,0.08)",
                borderRadius: 20,
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                transition: "all 0.25s ease",
                boxShadow: isVotedByMe
                  ? "0 0 24px rgba(230,168,34,0.35), 0 4px 20px rgba(0,0,0,0.4)"
                  : "0 4px 20px rgba(0,0,0,0.3)",
                position: "relative",
                backdropFilter: "blur(8px)",
              }}
              onMouseEnter={(e) => {
                if (!isVotedByMe)
                  (e.currentTarget as HTMLDivElement).style.border = "1.5px solid rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                if (!isVotedByMe)
                  (e.currentTarget as HTMLDivElement).style.border = "1.5px solid rgba(255,255,255,0.08)";
              }}
            >
              {/* (Bạn) badge */}
              {isMe && (
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: "#e6a822", color: "#000", fontSize: 10, fontWeight: 800,
                  padding: "2px 10px", borderRadius: 99, letterSpacing: "0.1em",
                }}>
                  BẠN
                </div>
              )}

              {/* ✅ badge nếu đã vote cho họ */}
              {isVotedByMe && (
                <div style={{
                  position: "absolute", top: -10, right: 12,
                  background: "#22c55e", color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "2px 10px", borderRadius: 99,
                }}>
                  ✅ Đã bầu
                </div>
              )}

              <PlayerAvatar name={player.displayName} color={color} />

              <div style={{ textAlign: "center" }}>
                <div style={{
                  color: "#fff", fontWeight: 700, fontSize: 15,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: 150,
                }}>
                  {player.displayName}
                </div>
              </div>

              {/* Số phiếu */}
              <div style={{
                fontSize: 13, color: votes > 0 ? "#e6a822" : "rgba(255,255,255,0.3)",
                fontWeight: 600, transition: "color 0.3s",
              }}>
                🗳️ {votes} phiếu
              </div>

              {/* Nút Vote */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isMe && !hasVoted) onVote(player.userId);
                }}
                disabled={isMe || hasVoted}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: "0.05em",
                  cursor: isMe || hasVoted ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  background: isVotedByMe
                    ? "rgba(34,197,94,0.15)"
                    : isMe || hasVoted
                    ? "rgba(255,255,255,0.06)"
                    : "linear-gradient(135deg, #e6a822, #d4941a)",
                  color: isVotedByMe ? "#22c55e" : isMe || hasVoted ? "rgba(255,255,255,0.3)" : "#000",
                  boxShadow: isVotedByMe || isMe || hasVoted
                    ? "none"
                    : "0 4px 12px rgba(230,168,34,0.4)",
                }}
              >
                {isVotedByMe ? "✅ Đã bầu" : isMe ? "(Bạn)" : "🗳️ VOTE"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Dead players row */}
      {deadPlayers.length > 0 && (
        <div style={{ marginTop: 24, zIndex: 1, width: "100%", maxWidth: 900 }}>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>
            Đã bị loại
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {deadPlayers.map((player) => (
              <div
                key={player.userId}
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1.5px solid rgba(255,0,0,0.15)",
                  borderRadius: 14,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  filter: "grayscale(100%)",
                  opacity: 0.5,
                  position: "relative",
                }}
              >
                <PlayerAvatar name={player.displayName} color="#666" size={40} />
                <span style={{ color: "#888", fontSize: 13, fontWeight: 600 }}>
                  {player.displayName}
                </span>
                <span style={{ position: "absolute", top: -8, right: -8, fontSize: 18 }}>❌</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SKIP BUTTON (chỉ Host) */}
      {isHost && (
        <div style={{ marginTop: 32, zIndex: 1 }}>
          <button
            onClick={onSkip}
            disabled={!canSkip}
            style={{
              padding: "12px 40px",
              borderRadius: 16,
              border: "1.5px solid rgba(255,255,255,0.15)",
              background: canSkip ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
              color: canSkip ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
              fontSize: 14,
              fontWeight: 700,
              cursor: canSkip ? "pointer" : "not-allowed",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              transition: "all 0.2s",
            }}
          >
            {canSkip ? "⏭️ BỎ QUA VOTE" : "⏳ Chờ 5 giây..."}
          </button>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", marginTop: 6 }}>
            Chỉ host mới thấy nút này
          </p>
        </div>
      )}

      {/* History Modal */}
      {historyPlayer && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, backdropFilter: "blur(4px)",
          }}
          onClick={() => setHistoryPlayer(null)}
        >
          <div
            style={{
              background: "#1a1a2e", border: "1.5px solid rgba(230,168,34,0.3)",
              borderRadius: 24, padding: "28px 32px", maxWidth: 400, width: "90%",
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <PlayerAvatar
                name={historyPlayer.displayName}
                color={roleColor[historyPlayer.role] ?? "#888"}
                size={52}
              />
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>
                  {historyPlayer.displayName}
                </div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                  Lịch sử miêu tả
                </div>
              </div>
            </div>

            {historyPlayer.descriptionHistory && historyPlayer.descriptionHistory.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {historyPlayer.descriptionHistory.map((word, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10, padding: "8px 14px",
                      color: "#e6a822", fontSize: 14, fontWeight: 600,
                    }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginRight: 8 }}>
                      #{i + 1}
                    </span>
                    {word}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center" }}>
                Chưa có từ nào được miêu tả.
              </p>
            )}

            <button
              onClick={() => setHistoryPlayer(null)}
              style={{
                marginTop: 20, width: "100%", padding: "10px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, color: "rgba(255,255,255,0.6)", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
