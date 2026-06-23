"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface GameEndedScreenProps {
  winner: "Civilian" | "BlackHat" | "WhiteHat" | string;
  myRole: string;
  myWord: string;
  civilianWord?: string;
  players: { userId: string; displayName: string; role: string; isEliminated: boolean }[];
  myUserId: string;
  roomId: string;
  onPlayAgain?: () => void;
  backgroundImage?: string;
}

const WINNER_CFG: Record<string, {
  title: string; subtitle: string; banner: string; icon: string;
  color: string; glow: string; bg: string; particles: string[];
}> = {
  Civilian: {
    title: "PHE DÂN THẮNG!", subtitle: "Toàn bộ nội gián đã bị loại.",
    banner: "linear-gradient(135deg, #00FF94, #00CC76)",
    icon: "🏛️", color: "#00FF94", glow: "rgba(0,255,148,0.6)",
    bg: "radial-gradient(ellipse 80% 55% at 50% 25%, rgba(0,255,148,0.12) 0%, transparent 70%)",
    particles: ["#00FF94", "#00F2FE", "#fff", "#00CC76"],
  },
  BlackHat: {
    title: "NỘI GIÁN XÂM CHIẾM!", subtitle: "Họ đã kiểm soát phòng chơi.",
    banner: "linear-gradient(135deg, #FF3B3B, #CC0000)",
    icon: "🎭", color: "#FF3B3B", glow: "rgba(255,59,59,0.6)",
    bg: "radial-gradient(ellipse 80% 55% at 50% 25%, rgba(255,59,59,0.12) 0%, transparent 70%)",
    particles: ["#FF3B3B", "#9D4EDD", "#FF9800", "#fff"],
  },
  WhiteHat: {
    title: "MŨ TRẮNG THẮNG!", subtitle: "Đã đoán đúng từ khóa của Dân Thường.",
    banner: "linear-gradient(135deg, #FFD700, #FF9800)",
    icon: "🤍", color: "#FFD700", glow: "rgba(255,215,0,0.6)",
    bg: "radial-gradient(ellipse 80% 55% at 50% 25%, rgba(255,215,0,0.10) 0%, transparent 70%)",
    particles: ["#FFD700", "#fff", "#FF9800", "#00F2FE"],
  },
};

const ROLE_LABEL: Record<string, { label: string; color: string; icon: string; glow: string }> = {
  Civilian: { label: "Dân Thường", color: "#00FF94", icon: "🏛️", glow: "rgba(0,255,148,0.5)" },
  BlackHat: { label: "Nội Gián",   color: "#FF3B3B", icon: "🎭", glow: "rgba(255,59,59,0.5)" },
  WhiteHat: { label: "Mũ Trắng",  color: "#FFD700", icon: "🤍", glow: "rgba(255,215,0,0.5)" },
};

// Funny badges
function getBadge(player: { role: string; isEliminated: boolean }, allPlayers: typeof GameEndedScreen.prototype, eliminationOrder: string[]) {
  return null; // logic below
}

const BADGES: { id: string; icon: string; label: string; check: (p: { role: string; isEliminated: boolean; userId: string }, all: { userId: string; role: string; isEliminated: boolean }[]) => boolean }[] = [
  { id: "first_out", icon: "🐑", label: "Cừu Non", check: (p, all) => p.isEliminated && all.filter(x => x.isEliminated).indexOf(p as any) === 0 },
  { id: "survivor_black", icon: "😈", label: "Kẻ Chém Gió", check: (p) => p.role === "BlackHat" && !p.isEliminated },
  { id: "last_stand", icon: "🛡️", label: "Kiên Cường", check: (p, all) => !p.isEliminated && all.filter(x => !x.isEliminated).length === 1 },
];

function Confetti({ colors }: { colors: string[] }) {
  const items = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      <style>{`
        @keyframes ge-fall {
          0%   { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(110vh) rotate(${Math.random() > 0.5 ? "" : "-"}720deg) scale(0.5); opacity: 0; }
        }
      `}</style>
      {items.map(i => (
        <div key={i} style={{
          position: "absolute",
          left: `${(i / items.length) * 100 + Math.sin(i) * 8}%`,
          top: `-${10 + (i % 5) * 4}px`,
          width: `${5 + (i % 4) * 3}px`,
          height: `${5 + (i % 4) * 3}px`,
          background: colors[i % colors.length],
          borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0",
          animation: `ge-fall ${3 + (i % 4)}s linear ${(i % 8) * 0.25}s infinite`,
          opacity: 0.85,
          boxShadow: `0 0 6px ${colors[i % colors.length]}80`,
        }} />
      ))}
    </div>
  );
}

export default function GameEndedScreen({
  winner, myRole, myWord, civilianWord, players, myUserId, roomId, onPlayAgain,
  backgroundImage,
}: GameEndedScreenProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"hidden" | "banner" | "full">("hidden");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("banner"), 200);
    const t2 = setTimeout(() => setPhase("full"), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const cfg = WINNER_CFG[winner] ?? WINNER_CFG["Civilian"];
  const isWinner = myRole === winner || (winner === "Civilian" && myRole === "Civilian");
  const myRoleInfo = ROLE_LABEL[myRole];
  const alivePlayers = players.filter(p => !p.isEliminated);
  const eliminatedPlayers = players.filter(p => p.isEliminated);
  const displayWord = civilianWord ?? myWord ?? "???";

  return (
    <div style={{
      position: "fixed", inset: 0,
      backgroundImage: `linear-gradient(180deg, rgba(6,6,16,0.92), rgba(10,8,18,0.44)), url(${backgroundImage ?? '/bg1.jpg'})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      display: "flex", flexDirection: "column",
      alignItems: "center",
      fontFamily: "'Nunito', 'Inter', sans-serif",
      zIndex: 200, overflow: "hidden auto", padding: "0 16px 40px",
    }}>
      <style>{`
        @keyframes ge-rise {
          from { opacity: 0; transform: translateY(40px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ge-icon-pulse {
          0%, 100% { transform: scale(1) rotate(-3deg); filter: drop-shadow(0 0 20px ${cfg.glow}); }
          50%       { transform: scale(1.12) rotate(3deg); filter: drop-shadow(0 0 50px ${cfg.glow}); }
        }
        @keyframes ge-shimmer {
          0%   { background-position: -300% center; }
          100% { background-position: 300% center; }
        }
        @keyframes ge-banner-slide {
          from { transform: translateY(-120%) scaleY(0.6); opacity: 0; }
          to   { transform: translateY(0) scaleY(1); opacity: 1; }
        }
        @keyframes ge-scanline {
          from { background-position: 0 0; }
          to   { background-position: 0 100vh; }
        }
      `}</style>

      {isWinner && <Confetti colors={cfg.particles} />}

      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: cfg.bg, zIndex: 0 }} />

      {/* Scanline */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)",
        backgroundSize: "100% 4px", animation: "ge-scanline 10s linear infinite",
      }} />

      {/* ── WINNER BANNER ── */}
      <div style={{
        width: "100%", maxWidth: 680, zIndex: 1,
        animation: phase !== "hidden" ? "ge-banner-slide 0.7s cubic-bezier(0.34,1.56,0.64,1) both" : "none",
        marginBottom: 28, marginTop: 32,
      }}>
        <div style={{
          background: cfg.banner,
          borderRadius: 24, padding: "28px 36px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          position: "relative", overflow: "hidden",
          boxShadow: `0 0 60px ${cfg.glow}50, 0 16px 50px rgba(0,0,0,0.6)`,
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)",
            backgroundSize: "300% auto",
            animation: "ge-shimmer 3s linear infinite",
          }} />

          {/* Icon */}
          <div style={{
            fontSize: 80, lineHeight: 1,
            animation: phase === "full" ? "ge-icon-pulse 2.5s ease-in-out infinite" : "none",
          }}>
            {cfg.icon}
          </div>

          {/* Win/Lose badge */}
          <div style={{
            background: "rgba(0,0,0,0.25)", borderRadius: 99, padding: "5px 20px",
            color: "#fff", fontSize: 12, fontWeight: 900, letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}>
            {isWinner ? "🏆 BẠN ĐÃ THẮNG!" : "💀 BẠN ĐÃ THUA"}
          </div>

          <h1 style={{
            fontSize: 30, fontWeight: 900, color: "#fff",
            textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            margin: "0", letterSpacing: "0.05em", textAlign: "center",
          }}>
            {cfg.title}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, margin: 0, textAlign: "center" }}>
            {cfg.subtitle}
          </p>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{
        width: "100%", maxWidth: 680, zIndex: 1,
        opacity: phase === "full" ? 1 : 0,
        transform: phase === "full" ? "translateY(0)" : "translateY(20px)",
        transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.4s",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Info row */}
        <div style={{ display: "flex", gap: 14 }}>
          {/* My role */}
          <div style={{
            flex: 1,
            background: `${myRoleInfo?.color ?? "#666"}08`,
            border: `1.5px solid ${myRoleInfo?.color ?? "#666"}30`,
            borderRadius: 18, padding: "20px 16px",
            textAlign: "center", position: "relative", overflow: "hidden",
          }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, letterSpacing: "0.25em", textTransform: "uppercase", margin: "0 0 8px" }}>Vai của bạn</p>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{myRoleInfo?.icon ?? "?"}</div>
            <div style={{
              color: myRoleInfo?.color ?? "#fff", fontWeight: 900, fontSize: 16,
              textShadow: `0 0 12px ${myRoleInfo?.glow ?? "transparent"}`,
            }}>
              {myRoleInfo?.label ?? myRole}
            </div>
          </div>

          {/* Keyword reveal */}
          <div style={{
            flex: 2,
            background: "rgba(255,215,0,0.05)",
            border: "1.5px solid rgba(255,215,0,0.25)",
            borderRadius: 18, padding: "20px 20px",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center",
          }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, letterSpacing: "0.25em", textTransform: "uppercase", margin: "0 0 10px" }}>
              Từ khóa vòng này
            </p>
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 30, fontWeight: 900, color: "#FFD700",
              textShadow: "0 0 20px rgba(255,215,0,0.8), 0 0 50px rgba(255,215,0,0.3)",
              letterSpacing: "0.1em",
              border: "1px dashed rgba(255,215,0,0.4)",
              padding: "8px 20px", borderRadius: 10,
            }}>
              {displayWord}
            </div>
          </div>
        </div>

        {/* Players table */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center",
          }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase" }}>
              Bảng Vinh Danh
            </span>
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {[...alivePlayers, ...eliminatedPlayers].map((player, i) => {
              const rInfo = ROLE_LABEL[player.role];
              const isMe = player.userId === myUserId;

              // Simple badges
              const badges: { icon: string; label: string }[] = [];
              if (player.isEliminated && eliminatedPlayers[0]?.userId === player.userId)
                badges.push({ icon: "🐑", label: "Cừu Non" });
              if (!player.isEliminated && player.role === "BlackHat")
                badges.push({ icon: "😈", label: "Kẻ Chém Gió" });
              if (!player.isEliminated && player.role === "Civilian" && alivePlayers.length <= 2)
                badges.push({ icon: "🦁", label: "Kiên Cường" });
              if (player.role === "WhiteHat" && !player.isEliminated)
                badges.push({ icon: "🧠", label: "Bộ Não Thiên Tài" });

              return (
                <div key={player.userId} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: player.isEliminated ? 0.55 : 1,
                  filter: player.isEliminated ? "grayscale(30%)" : "none",
                  background: isMe ? "rgba(255,255,255,0.025)" : "transparent",
                  transition: "background 0.2s",
                }}>
                  {/* Position */}
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: 700, minWidth: 18 }}>
                    {i + 1}
                  </span>

                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: `${rInfo?.color ?? "#666"}18`,
                    border: `2px solid ${rInfo?.color ?? "#666"}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, color: rInfo?.color ?? "#666",
                    boxShadow: `0 0 8px ${rInfo?.glow ?? "transparent"}40`,
                  }}>
                    {player.displayName.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + badges */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: isMe ? "#FFD700" : "#fff",
                      fontWeight: 800, fontSize: 14,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {player.displayName}
                      {isMe && <span style={{ color: "rgba(255,215,0,0.5)", fontSize: 10, marginLeft: 6 }}>(Bạn)</span>}
                    </div>
                    {badges.length > 0 && (
                      <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
                        {badges.map(b => (
                          <span key={b.label} style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 99, padding: "1px 8px",
                            color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 700,
                          }}>
                            {b.icon} {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Role */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 18 }}>{rInfo?.icon ?? "?"}</span>
                    <span style={{
                      color: rInfo?.color ?? "#999", fontSize: 12, fontWeight: 800,
                      textShadow: `0 0 8px ${rInfo?.glow ?? "transparent"}`,
                    }}>
                      {rInfo?.label ?? player.role}
                    </span>
                  </div>

                  {player.isEliminated && <span style={{ fontSize: 14, flexShrink: 0 }}>❌</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          {onPlayAgain && (
            <button onClick={onPlayAgain} style={{
              flex: 1, padding: "16px 0", borderRadius: 16, border: "none",
              background: cfg.banner,
              color: winner === "Civilian" || winner === "WhiteHat" ? "#000" : "#fff",
              fontWeight: 900, fontSize: 15, cursor: "pointer",
              letterSpacing: "0.08em", textTransform: "uppercase",
              boxShadow: `0 8px 32px ${cfg.glow}50`,
              transition: "all 0.25s", fontFamily: "'Nunito', 'Inter', sans-serif",
              position: "relative", overflow: "hidden",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"}
            >
              🔄 Chơi Lại
            </button>
          )}
          <button onClick={() => router.push("/menu")} style={{
            flex: 1, padding: "16px 0", borderRadius: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1.5px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 800, fontSize: 15, cursor: "pointer",
            letterSpacing: "0.06em", transition: "all 0.25s",
            fontFamily: "'Nunito', 'Inter', sans-serif",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; }}
          >
            🏠 Về Menu
          </button>
        </div>
      </div>
    </div>
  );
}
