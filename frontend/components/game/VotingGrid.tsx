"use client";
import { useState, useEffect, useRef } from "react";
import CountdownTimer from "./CountdownTimer";
import { useGameSound } from "@/hooks/useGameSound";

interface VotePlayer {
  userId: string;
  displayName: string;
  avatar?: string;
  role: string;
  isEliminated: boolean;
  voteCount: number;
  descriptionHistory?: string[];
}

interface VotingGridProps {
  players: VotePlayer[];
  myUserId: string;
  voteEndTime: number;
  realtimeVoteCounts: Record<string, number>;
  realtimeVotes?: Record<string, string>;
  totalVotesCast?: number;
  hasVoted: boolean;
  myVoteTarget: string | null;
  canSkip: boolean;
  isHost: boolean;
  isEliminated: boolean;
  extendVoteCount?: number;
  extendRequiredCount?: number;
  hasRequestedExtend?: boolean;
  isTimeExtended?: boolean;
  skipVoteCount?: number;
  skipRequiredCount?: number;
  hasSkippedVote?: boolean;
  onExtendVote?: () => void;
  onVote: (targetUserId: string) => void;
  onChangeVote: (targetUserId: string) => void;
  onRevokeVote?: () => void;
  onSkip: () => void;
  onTimerExpired: () => void;
  backgroundImage?: string;
  isWhiteHatGuessing?: boolean;
  whiteHatId?: string | null;
  whiteHatTimeLeft?: number;
}

export default function VotingGrid({
  players, myUserId, voteEndTime, realtimeVoteCounts, realtimeVotes = {}, totalVotesCast = 0,
  hasVoted, myVoteTarget, canSkip, isHost, isEliminated,
  extendVoteCount = 0, extendRequiredCount = 0, hasRequestedExtend = false, isTimeExtended = false,
  skipVoteCount = 0, skipRequiredCount = 0, hasSkippedVote = false, onExtendVote,
  onVote, onChangeVote, onRevokeVote, onSkip, onTimerExpired,
  backgroundImage,
  isWhiteHatGuessing = false, whiteHatId, whiteHatTimeLeft = 0,
}: VotingGridProps) {
  const { playClick, playVote } = useGameSound();
  const [whiteHatEndTime, setWhiteHatEndTime] = useState<number>(0);

  useEffect(() => {
    if (isWhiteHatGuessing && whiteHatTimeLeft > 0) {
      setWhiteHatEndTime(Date.now() + whiteHatTimeLeft * 1000);
    }
  }, [isWhiteHatGuessing, whiteHatTimeLeft]);
  const [changingVote, setChangingVote] = useState(false);
  const prevCounts = useRef<Record<string, number>>({});
  const [pulsing, setPulsing] = useState<Record<string, boolean>>({});
  const [hovering, setHovering] = useState<string | null>(null);

  const alivePlayers = isWhiteHatGuessing 
    ? players // In White Hat guess, show all players (including WhiteHat)
    : players.filter(p => !p.isEliminated);
  const deadPlayers = isWhiteHatGuessing 
    ? [] // Hide dead players list during White Hat guess to focus on the spotlight
    : players.filter(p => p.isEliminated);
  const maxVotes = Math.max(0, ...alivePlayers.map(p => realtimeVoteCounts[p.userId] ?? p.voteCount ?? 0));
  const noVoters = Object.entries(realtimeVotes)
    .filter(([_, targetId]) => targetId === "NO_VOTE")
    .map(([voterId]) => players.find(p => p.userId === voterId))
    .filter(Boolean) as VotePlayer[];

  useEffect(() => {
    const newPulsing: Record<string, boolean> = {};
    Object.entries(realtimeVoteCounts).forEach(([uid, count]) => {
      if (prevCounts.current[uid] !== count) newPulsing[uid] = true;
    });
    prevCounts.current = { ...realtimeVoteCounts };
    if (Object.keys(newPulsing).length > 0) {
      setPulsing(newPulsing);
      setTimeout(() => setPulsing({}), 600);
    }
  }, [realtimeVoteCounts]);

  return (
    <div style={{
      minHeight: "100vh", width: "100vw",
      backgroundImage: `linear-gradient(180deg, rgba(8,10,18,0.92), rgba(8,10,18,0.3)), url(${backgroundImage ?? '/bg1.jpg'})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 16px 120px",
      fontFamily: "'Nunito', 'Inter', sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes vg-pulse {
          0%  { transform: scale(1); }
          40% { transform: scale(1.14); }
          100%{ transform: scale(1); }
        }
        @keyframes vg-card-hover {
          from { box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
          to   { box-shadow: 0 0 40px rgba(255,59,59,0.3), 0 8px 30px rgba(0,0,0,0.6); }
        }
        @keyframes vg-voted-glow {
          0%, 100% { box-shadow: 0 0 24px rgba(157,78,221,0.35), 0 8px 28px rgba(0,0,0,0.5); }
          50%       { box-shadow: 0 0 48px rgba(157,78,221,0.55), 0 8px 28px rgba(0,0,0,0.5); }
        }
        @keyframes vg-header-glow {
          0%, 100% { text-shadow: 0 0 20px rgba(255,59,59,0.6), 0 0 60px rgba(255,59,59,0.2); }
          50%       { text-shadow: 0 0 40px rgba(255,59,59,0.9), 0 0 100px rgba(255,59,59,0.4); }
        }
      `}</style>

      {/* Ambient */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,59,59,0.06) 0%, transparent 70%)",
      }} />

      {/* ── HEADER ── */}
      <div style={{
        textAlign: "center", padding: "32px 0 20px",
        zIndex: 1, width: "100%", maxWidth: 860,
      }}>
        <p style={{ color: isWhiteHatGuessing ? "rgba(255,215,0,0.5)" : "rgba(255,59,59,0.5)", fontSize: 10, letterSpacing: "0.4em", textTransform: "uppercase", margin: "0 0 8px" }}>
          — {isWhiteHatGuessing ? "Cơ Hội Cuối Cùng" : "Vòng Bình Chọn"} —
        </p>
        <h1 style={{
          fontSize: 30, fontWeight: 900, color: isWhiteHatGuessing ? "#FFD700" : "#FF3B3B",
          animation: isWhiteHatGuessing ? "none" : "vg-header-glow 2.5s ease-in-out infinite",
          textShadow: isWhiteHatGuessing ? "0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.2)" : undefined,
          margin: "0 0 20px", letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {isWhiteHatGuessing ? "MŨ TRẮNG ĐANG ĐOÁN TỪ KHÓA" : "🎯 AI LÀ KẺ ĐÁNG NGHI?"}
        </h1>

        <CountdownTimer 
          endTime={isWhiteHatGuessing ? whiteHatEndTime : voteEndTime} 
          onExpired={isWhiteHatGuessing ? () => {} : onTimerExpired} 
        />

        {/* Status pill */}
        <div style={{ marginTop: 14 }}>
          {isWhiteHatGuessing ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: 99, padding: "7px 18px",
              color: "#FFD700", fontSize: 13, fontWeight: 700,
            }}>⏳ Chờ mũ trắng đưa ra quyết định...</div>
          ) : isEliminated ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,59,59,0.07)", border: "1px solid rgba(255,59,59,0.2)",
              borderRadius: 99, padding: "7px 18px",
              color: "#FF3B3B", fontSize: 13, fontWeight: 700,
            }}>❌ Bạn đã bị loại — không thể vote</div>
          ) : hasVoted && myVoteTarget && !changingVote ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(157,78,221,0.08)", border: "1px solid rgba(157,78,221,0.25)",
                borderRadius: 99, padding: "7px 18px",
                color: "#9D4EDD", fontSize: 13, fontWeight: 700,
              }}>
                ✅ {myVoteTarget === "NO_VOTE" ? "Đã chọn Không vote" : 
                  <span>Đã bầu cho <strong style={{ color: "#fff", marginLeft: 4 }}>{players.find(p => p.userId === myVoteTarget)?.displayName}</strong></span>
                }
              </div>
              <button onClick={() => { playClick(); setChangingVote(true); }} style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 99, padding: "7px 16px", color: "rgba(255,255,255,0.45)",
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#fff"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"}
              >🔄 Đổi vote</button>
              <button onClick={() => { playClick(); if(onRevokeVote) onRevokeVote(); }} style={{
                background: "rgba(255,59,59,0.05)", border: "1px solid rgba(255,59,59,0.2)",
                borderRadius: 99, padding: "7px 16px", color: "#FF3B3B",
                fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
              }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,59,59,0.15)"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,59,59,0.05)"}
              >🔙 Thu hồi</button>
            </div>
          ) : changingVote ? (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(0,242,254,0.07)", border: "1px solid rgba(0,242,254,0.2)",
              borderRadius: 99, padding: "7px 18px", color: "#00F2FE", fontSize: 13, fontWeight: 700,
            }}>🔄 Chọn người mới để đổi vote</div>
          ) : (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,59,59,0.06)", border: "1px solid rgba(255,59,59,0.2)",
              borderRadius: 99, padding: "7px 18px", color: "#FF3B3B", fontSize: 13, fontWeight: 700,
            }}>🎯 Chọn người bạn nghi ngờ</div>
          )}
        </div>
      </div>

      {/* ── VOTE GRID ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
        gap: 16, width: "100%", maxWidth: 860, zIndex: 1,
      }}>
        {alivePlayers.map(player => {
          const isMe = player.userId === myUserId;
          const isSpotlight = isWhiteHatGuessing && player.userId === whiteHatId;
          const isVotedByMe = myVoteTarget === player.userId;
          const votes = realtimeVoteCounts[player.userId] ?? player.voteCount ?? 0;
          const isLeading = votes > 0 && votes === maxVotes && maxVotes > 0;
          const isPulsing = pulsing[player.userId];
          const isHovered = hovering === player.userId;
          const canVote = !isWhiteHatGuessing && !isMe && !isEliminated && (!hasVoted || changingVote);
          const votersForThisPlayer = Object.entries(realtimeVotes)
            .filter(([_, targetId]) => targetId === player.userId)
            .map(([voterId]) => players.find(p => p.userId === voterId))
            .filter(Boolean) as VotePlayer[];
          const hasPlayerVoted = realtimeVotes[player.userId] !== undefined;

          return (
            <div key={player.userId}
              onClick={() => {
                if (!canVote) return;
                playVote();
                if (changingVote) { onChangeVote(player.userId); setChangingVote(false); }
                else onVote(player.userId);
              }}
              onMouseEnter={() => canVote && !isVotedByMe && setHovering(player.userId)}
              onMouseLeave={() => setHovering(null)}
              style={{
                position: "relative",
                borderRadius: 22,
                padding: "24px 18px 18px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                cursor: canVote ? "pointer" : "default",
                opacity: (isWhiteHatGuessing && !isSpotlight) ? 0.3 : 1,
                filter: (isWhiteHatGuessing && !isSpotlight) ? "grayscale(100%)" : "none",
                transform: isSpotlight ? "scale(1.05)" : "scale(1)",
                border: isSpotlight
                  ? "2px solid #FFD700"
                  : isVotedByMe
                    ? "2px solid rgba(157,78,221,0.55)"
                    : isLeading
                      ? "1.5px solid rgba(255,59,59,0.35)"
                      : isHovered
                        ? "1.5px solid rgba(255,59,59,0.25)"
                        : "1.5px solid rgba(255,255,255,0.06)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                zIndex: isSpotlight ? 10 : 1,
                boxShadow: isSpotlight ? "0 0 30px rgba(255,215,0,0.4)" : "none",
              }}
            >
              {/* GLASS BACKGROUND LAYER */}
              <div style={{
                position: "absolute",
                inset: 0,
                zIndex: -1,
                borderRadius: "inherit",
                background: isSpotlight
                  ? "linear-gradient(160deg, rgba(255,215,0,0.15) 0%, rgba(255,255,255,0.02) 100%)"
                  : isVotedByMe
                    ? "linear-gradient(160deg, rgba(157,78,221,0.12) 0%, rgba(255,255,255,0.02) 100%)"
                    : isLeading
                      ? "linear-gradient(160deg, rgba(255,59,59,0.08) 0%, rgba(255,255,255,0.02) 100%)"
                      : isHovered
                        ? "linear-gradient(160deg, rgba(255,59,59,0.06) 0%, rgba(255,255,255,0.02) 100%)"
                        : "rgba(255,255,255,0.025)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                transition: "background 0.2s ease, box-shadow 0.2s ease",
                animation: isSpotlight
                  ? "vg-voted-glow 2.5s ease-in-out infinite" // Reuse pulse animation or make a yellow one
                  : isVotedByMe
                    ? "vg-voted-glow 2.5s ease-in-out infinite"
                    : isHovered && canVote
                      ? "vg-card-hover 0.2s ease forwards"
                      : "none",
              }} />

              {/* Spotlight Status Text */}
              {isSpotlight && (
                <div style={{
                  position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)",
                  background: "#FFD700", color: "#000",
                  padding: "4px 12px", borderRadius: 12,
                  fontSize: 11, fontWeight: 900,
                  whiteSpace: "nowrap", zIndex: 20,
                  boxShadow: "0 4px 12px rgba(255,215,0,0.5)",
                }}>
                  ĐANG SUY NGHĨ...
                </div>
              )}

              {/* Top badges */}
              {isMe && (
                <div style={{
                  position: "absolute", top: -9, left: 12,
                  background: "linear-gradient(135deg, #FFD700, #FF9800)",
                  color: "#000", fontSize: 9, fontWeight: 900, padding: "2px 12px", borderRadius: 99,
                  letterSpacing: "0.1em", whiteSpace: "nowrap",
                }}>BẠN</div>
              )}
              {isVotedByMe && (
                <div style={{
                  position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
                  background: "linear-gradient(135deg, #9D4EDD, #7B2FBE)",
                  color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 12px", borderRadius: 99,
                  letterSpacing: "0.1em", whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(157,78,221,0.4)",
                }}>✅ ĐÃ BẦU</div>
              )}
              {isLeading && !isVotedByMe && (
                <div style={{
                  position: "absolute", top: -9, right: 12,
                  background: "linear-gradient(135deg, #FF3B3B, #CC0000)",
                  color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 10px", borderRadius: 99,
                  letterSpacing: "0.08em",
                  boxShadow: "0 4px 12px rgba(255,59,59,0.4)",
                }}>🔴 DẪN ĐẦU</div>
              )}

              <div style={{ position: "relative" }}>
                <div
                  style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: `radial-gradient(circle at 35% 35%, ${isVotedByMe ? "rgba(157,78,221,0.35)" : isLeading ? "rgba(255,59,59,0.25)" : "rgba(0,242,254,0.15)"}, #0B0C10)`,
                  border: `3px solid ${isVotedByMe ? "#9D4EDD" : isLeading ? "#FF3B3B" : "rgba(0,242,254,0.4)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, fontWeight: 900,
                  color: isVotedByMe ? "#9D4EDD" : isLeading ? "#FF3B3B" : "#00F2FE",
                  boxShadow: `0 0 16px ${isVotedByMe ? "rgba(157,78,221,0.4)" : isLeading ? "rgba(255,59,59,0.3)" : "rgba(0,242,254,0.2)"}`,
                  transition: "all 0.25s",
                  flexShrink: 0,
                  cursor: "pointer",
                  overflow: "hidden",
                }}>
                  {player.avatar ? (
                    <img src={player.avatar} alt={player.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    player.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                {hasPlayerVoted && (
                  <div style={{
                    position: "absolute", bottom: -2, right: -2,
                    background: "#10B981", color: "#fff",
                    borderRadius: "50%", width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, border: "2px solid #0B0C10",
                    boxShadow: "0 0 8px rgba(16,185,129,0.5)", zIndex: 10
                  }} title="Đã chốt phiếu">✓</div>
                )}
              </div>

              {/* Name */}
              <div style={{
                color: isMe ? "#FFD700" : "#fff", fontWeight: 800, fontSize: 14,
                maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textAlign: "center",
              }}>
                {player.displayName}
              </div>

              {/* Vote dots */}
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 14px", borderRadius: 99,
                background: votes > 0 ? "rgba(255,59,59,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${votes > 0 ? "rgba(255,59,59,0.3)" : "rgba(255,255,255,0.07)"}`,
                animation: isPulsing ? "vg-pulse 0.4s ease" : "none",
                transition: "all 0.3s",
              }}>
                <span style={{
                  color: votes > 0 ? "#FF3B3B" : "rgba(255,255,255,0.25)",
                  fontWeight: 900, fontSize: 18, transition: "color 0.3s",
                }}>
                  {votes}
                </span>
                <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>phiếu</span>
              </div>

              {/* Voters Avatars Overlapping */}
              {votersForThisPlayer.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: -4 }}>
                  {votersForThisPlayer.map((voter, idx) => (
                    <div key={voter.userId} style={{
                      width: 24, height: 24, borderRadius: "50%",
                      border: "2px solid #0B0C10",
                      background: "rgba(255,255,255,0.1)",
                      marginLeft: idx === 0 ? 0 : -8,
                      zIndex: votersForThisPlayer.length - idx,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      overflow: "hidden", fontSize: 10, fontWeight: "bold"
                    }} title={voter.displayName}>
                      {voter.avatar ? (
                        <img src={voter.avatar} alt={voter.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : voter.displayName.charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
              )}

              {/* Vote button */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (isVotedByMe && !changingVote) {
                    playClick();
                    if (onRevokeVote) onRevokeVote();
                    return;
                  }
                  if (!canVote) return;
                  playVote();
                  if (changingVote) { onChangeVote(player.userId); setChangingVote(false); }
                  else onVote(player.userId);
                }}
                disabled={!canVote && !(isVotedByMe && !changingVote)}
                style={{
                  width: "100%", padding: "10px 0",
                  borderRadius: 14, border: "none",
                  fontWeight: 900, fontSize: 13, letterSpacing: "0.06em",
                  cursor: canVote || (isVotedByMe && !changingVote) ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  background: isMe
                    ? "rgba(255,255,255,0.04)"
                    : isVotedByMe && !changingVote
                      ? "rgba(157,78,221,0.12)"
                      : canVote
                        ? "linear-gradient(135deg, #FF3B3B, #CC0000)"
                        : "rgba(255,255,255,0.04)",
                  color: isMe
                    ? "rgba(255,255,255,0.2)"
                    : isVotedByMe && !changingVote
                      ? "#9D4EDD"
                      : canVote ? "#fff" : "rgba(255,255,255,0.15)",
                  boxShadow: canVote && !isVotedByMe && !isMe ? "0 4px 16px rgba(255,59,59,0.35)" : "none",
                  fontFamily: "'Nunito', 'Inter', sans-serif",
                }}
              >
                {isMe ? "(Bạn)"
                  : isVotedByMe && !changingVote ? "🔙 Hủy bầu"
                  : changingVote ? "🔄 Chọn"
                  : "🗳️ VOTE"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── DEAD PLAYERS ── */}
      {deadPlayers.length > 0 && (
        <div style={{ marginTop: 28, zIndex: 1, width: "100%", maxWidth: 860 }}>
          <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>
            Đã bị loại
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {deadPlayers.map(player => (
              <div key={player.userId} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 12, padding: "8px 14px",
                filter: "grayscale(100%)", opacity: 0.4,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, color: "#666",
                }}>
                  {player.displayName.charAt(0).toUpperCase()}
                </div>
                <span style={{ color: "#666", fontSize: 13, fontWeight: 600 }}>{player.displayName}</span>
                <span style={{ fontSize: 14 }}>❌</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EXTEND VOTE / SKIP VOTE / NO VOTE ── */}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 50,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
      }}>
        {/* Kéo dài thời gian */}
        {!isEliminated && onExtendVote && !isTimeExtended && (
          <button onClick={() => { playClick(); onExtendVote(); }} style={{
            padding: "10px 20px", borderRadius: 12,
            background: extendVoteCount > 0 ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.35)",
            color: "#10B981",
            fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s",
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.25)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = extendVoteCount > 0 ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.12)"}
          >
            ⏳ {hasRequestedExtend 
                  ? `Đã xin thêm phút (${extendVoteCount}/${extendRequiredCount}) - Nhấn để hủy` 
                  : extendVoteCount > 0 
                    ? `Thêm một phút (${extendVoteCount}/${extendRequiredCount})`
                    : "Thêm một phút"}
          </button>
        )}

        {/* Không vote (Trắng phiếu) */}
        {!isEliminated && (!hasVoted || myVoteTarget === "NO_VOTE") && !changingVote && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {noVoters.length > 0 && (
              <div style={{ display: "flex", alignItems: "center" }}>
                {noVoters.map((voter, idx) => (
                  <div key={voter.userId} style={{
                    width: 24, height: 24, borderRadius: "50%",
                    border: "2px solid #0B0C10",
                    background: "rgba(255,255,255,0.1)",
                    marginLeft: idx === 0 ? 0 : -8,
                    zIndex: noVoters.length - idx,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", fontSize: 10, fontWeight: "bold"
                  }} title={voter.displayName}>
                    {voter.avatar ? (
                      <img src={voter.avatar} alt={voter.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : voter.displayName.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => {
              playClick();
              if (myVoteTarget === "NO_VOTE" && onRevokeVote) {
                onRevokeVote();
              } else {
                onVote("NO_VOTE");
              }
            }} style={{
              padding: "10px 20px", borderRadius: 12,
              background: myVoteTarget === "NO_VOTE" ? "rgba(255,59,59,0.15)" : "rgba(255,59,59,0.08)",
              border: "1px solid rgba(255,59,59,0.25)",
              color: "#FF3B3B", fontSize: 13, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.2s",
              fontFamily: "'Nunito', 'Inter', sans-serif",
              display: "flex", alignItems: "center", gap: 6,
            }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,59,59,0.2)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = myVoteTarget === "NO_VOTE" ? "rgba(255,59,59,0.15)" : "rgba(255,59,59,0.08)"}
            >
              {myVoteTarget === "NO_VOTE" ? "🔙 Hủy Không vote" : "❌ Không vote"}
            </button>
          </div>
        )}

        {/* Bỏ qua vòng vote */}
        {!isEliminated && !changingVote && (
          <button onClick={() => { playClick(); onSkip(); }} style={{
            padding: "10px 20px", borderRadius: 12,
            background: skipVoteCount > 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.7)",
            fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.2s",
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = skipVoteCount > 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"}
          >
            ⏭️ {hasSkippedVote 
                  ? `Đã xin bỏ qua (${skipVoteCount}/${skipRequiredCount}) - Nhấn để hủy` 
                  : skipVoteCount > 0 
                    ? `Bỏ qua vòng vote (${skipVoteCount}/${skipRequiredCount})`
                    : "Bỏ qua vòng vote"}
          </button>
        )}
      </div>
    </div>
  );
}
