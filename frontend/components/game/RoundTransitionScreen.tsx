"use client";
import { useEffect, useState } from "react";

interface RoundTransitionScreenProps {
  roundNumber: number;
  isTieVote: boolean;
  eliminatedPlayerName?: string | null;
  eliminatedPlayerRole?: string | null;
  alivePlayers: { userId: string; displayName: string }[];
  countdownDuration?: number;
  isGameOver?: boolean;
  onCountdownEnd: () => void;
  backgroundImage?: string;
}

const ROLE_LABEL: Record<string, { label: string; icon: string; color: string; glow: string }> = {
  Civilian:  { label: "Dân Thường", icon: "🏛️", color: "#00FF94", glow: "rgba(0,255,148,0.6)" },
  BlackHat:  { label: "Nội Gián",   icon: "🎭", color: "#FF3B3B", glow: "rgba(255,59,59,0.6)" },
  WhiteHat:  { label: "Mũ Trắng",  icon: "🤍", color: "#FFD700", glow: "rgba(255,215,0,0.6)" },
};

export default function RoundTransitionScreen({
  roundNumber, isTieVote, eliminatedPlayerName, eliminatedPlayerRole,
  alivePlayers = [], countdownDuration = 0, isGameOver = false, onCountdownEnd,
  backgroundImage,
}: RoundTransitionScreenProps) {
  const [countdown, setCountdown] = useState(countdownDuration);
  const [phase, setPhase] = useState<"dark" | "spotlight" | "reveal" | "next">("dark");

  const roleInfo = eliminatedPlayerRole ? ROLE_LABEL[eliminatedPlayerRole] : null;
  const accentColor = isTieVote ? "#FFD700" : "#FF3B3B";
  const accentGlow = isTieVote ? "rgba(255,215,0,0.6)" : "rgba(255,59,59,0.6)";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("spotlight"), 200);
    const t2 = setTimeout(() => setPhase("reveal"), 900);
    const t3 = setTimeout(() => setPhase("next"), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      onCountdownEnd();
    }
  }, [countdown, onCountdownEnd]);

  return (
    <div style={{
      position: "fixed", inset: 0,
      backgroundImage: `linear-gradient(180deg, rgba(8,10,18,0.82), rgba(8,10,18,0.32)), url(${backgroundImage ?? '/bg1.jpg'})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backdropFilter: "blur(2px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Nunito', 'Inter', sans-serif",
      zIndex: 100, overflow: "hidden", padding: "24px 20px",
    }}>
      <style>{`
        @keyframes rt-spot-in {
          from { opacity: 0; transform: scale(0.85) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes rt-reveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rt-bounce-in {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); }
          80%  { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rt-scanline {
          from { background-position: 0 0; }
          to   { background-position: 0 100vh; }
        }
        @keyframes rt-role-glow {
          0%, 100% { box-shadow: 0 0 24px ${roleInfo?.glow ?? accentGlow}, 0 0 60px ${roleInfo?.glow ?? accentGlow}40; }
          50%       { box-shadow: 0 0 48px ${roleInfo?.glow ?? accentGlow}, 0 0 100px ${roleInfo?.glow ?? accentGlow}60; }
        }
        @keyframes rt-countdown-pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.08); }
        }
      `}</style>

      {/* Vignette overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 50% 50% at 50% 50%, transparent 0%, rgba(0,0,0,0.85) 100%)",
      }} />

      {/* Spotlight beam */}
      {phase !== "dark" && eliminatedPlayerName && !isTieVote && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          background: `radial-gradient(ellipse 28% 40% at 50% 38%, ${accentColor}08 0%, transparent 65%)`,
          transition: "opacity 0.7s ease",
          opacity: phase === "spotlight" || phase === "reveal" || phase === "next" ? 1 : 0,
        }} />
      )}

      {/* Scanline */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
        backgroundSize: "100% 4px", animation: "rt-scanline 10s linear infinite",
      }} />

      {/* ── MAIN CONTENT ── */}
      <div style={{
        width: "100%", maxWidth: 540, zIndex: 1,
        opacity: phase !== "dark" ? 1 : 0,
        transform: phase !== "dark" ? "translateY(0)" : "translateY(24px)",
        transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* ── RESULT CARD ── */}
        <div style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
          backdropFilter: "blur(24px)",
          border: `1.5px solid ${accentColor}30`,
          borderRadius: 30, padding: "40px 40px 32px",
          textAlign: "center", marginBottom: 20,
          position: "relative", overflow: "hidden",
          boxShadow: `0 0 60px ${accentGlow}15, 0 24px 60px rgba(0,0,0,0.7)`,
          animation: phase === "reveal" || phase === "next" ? "rt-spot-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both" : "none",
          opacity: phase === "reveal" || phase === "next" ? 1 : 0,
        }}>
          {/* Top accent line */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(to right, transparent, ${accentColor}, transparent)`,
            boxShadow: `0 0 16px ${accentGlow}`,
          }} />

          {/* KẾT QUẢ tag */}
          <div style={{
            display: "inline-block",
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}35`,
            borderRadius: 99, padding: "4px 16px",
            color: accentColor, fontSize: 10, fontWeight: 900,
            letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 24,
          }}>
            KẾT QUẢ BỎ PHIẾU
          </div>

          {/* Big icon */}
          <div style={{
            fontSize: 72, lineHeight: 1, marginBottom: 20,
            filter: `drop-shadow(0 0 24px ${accentGlow})`,
            animation: phase === "reveal" || phase === "next" ? "rt-bounce-in 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.15s both" : "none",
          }}>
            {isTieVote ? "🤝" : "☠️"}
          </div>

          {isTieVote ? (
            <>
              <h2 style={{
                fontSize: 34, fontWeight: 900, color: "#FFD700",
                textShadow: "0 0 24px rgba(255,215,0,0.7)",
                margin: "0 0 10px", letterSpacing: "0.06em",
              }}>HÒA PHIẾU!</h2>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, margin: 0 }}>
                Không ai bị loại lần này. Cuộc chiến vẫn tiếp diễn!
              </p>
            </>
          ) : (
            <>
              <p style={{
                color: `${accentColor}90`, fontSize: 11, letterSpacing: "0.3em",
                textTransform: "uppercase", margin: "0 0 6px",
              }}>Bị loại</p>
              <h2 style={{
                fontSize: 32, fontWeight: 900, color: "#fff",
                textShadow: `0 0 30px ${accentGlow}`,
                margin: "0 0 6px", letterSpacing: "0.04em",
              }}>
                {eliminatedPlayerName}
              </h2>
              <p style={{
                color: accentColor, fontSize: 14, fontWeight: 700, margin: "0 0 20px",
                letterSpacing: "0.1em",
              }}>đã bị loại với số phiếu cao nhất</p>

              {/* Role reveal */}
              {roleInfo && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 12,
                  padding: "14px 24px", borderRadius: 16,
                  background: `${roleInfo.color}0D`,
                  border: `1.5px solid ${roleInfo.color}35`,
                  animation: phase === "next" ? "rt-role-glow 2.5s ease-in-out infinite, rt-reveal 0.5s ease 0.3s both" : "none",
                  opacity: phase === "next" ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}>
                  <span style={{ fontSize: 28 }}>{roleInfo.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 3px" }}>
                      Vai trò thật sự
                    </p>
                    <p style={{
                      color: roleInfo.color, fontWeight: 900, fontSize: 20, margin: 0,
                      textShadow: `0 0 16px ${roleInfo.glow}`,
                    }}>
                      {roleInfo.label}
                    </p>
                  </div>
                </div>
              )}
              {eliminatedPlayerRole === null && eliminatedPlayerName && (
                <div style={{
                  display: "inline-block",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "10px 20px",
                  color: "rgba(255,255,255,0.3)", fontSize: 14, fontStyle: "italic",
                  animation: phase === "next" ? "rt-reveal 0.5s ease 0.3s both" : "none",
                  opacity: phase === "next" ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}>
                  🔒 Vai trò được giữ bí mật
                </div>
              )}
            </>
          )}
        </div>

        {/* ── NEXT ROUND INFO ── */}
        {!isGameOver && (
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 22, padding: "20px 28px", marginBottom: 20,
            animation: phase === "next" ? "rt-reveal 0.5s ease 0.6s both" : "none",
            opacity: phase === "next" ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 4px" }}>Vòng tiếp theo</p>
                <p style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>
                  Vòng <span style={{ color: "#00F2FE", textShadow: "0 0 12px rgba(0,242,254,0.6)" }}>{roundNumber}</span>
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 4px" }}>Còn lại</p>
                <p style={{ color: "#00FF94", fontWeight: 900, fontSize: 20, margin: 0, textShadow: "0 0 12px rgba(0,255,148,0.5)" }}>
                  {alivePlayers.length} người
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {alivePlayers.map(p => (
                <div key={p.userId} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(0,255,148,0.05)",
                  border: "1px solid rgba(0,255,148,0.15)",
                  borderRadius: 8, padding: "4px 10px",
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(0,255,148,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 900, color: "#00FF94",
                  }}>
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>{p.displayName}</span>
                </div>
              ))}
            </div>

            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, margin: "12px 0 0", fontStyle: "italic" }}>
              🔀 Thứ tự lượt nói sẽ được random lại.
            </p>
          </div>
        )}

        {/* ── COUNTDOWN ── */}
        <div style={{
          textAlign: "center",
          opacity: phase === "next" ? 1 : 0,
          transition: "opacity 0.4s ease 0.8s",
        }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, letterSpacing: "0.15em", margin: "0 0 10px" }}>
            {isGameOver ? "Trò chơi kết thúc sau" : "Vòng mới bắt đầu sau"}
          </p>
          <div style={{
            fontSize: 64, fontWeight: 900,
            color: "#00F2FE",
            textShadow: "0 0 24px rgba(0,242,254,0.7), 0 0 60px rgba(0,242,254,0.3)",
            fontFamily: "'Courier New', monospace", lineHeight: 1,
            animation: "rt-countdown-pulse 1s ease-in-out infinite",
          }}>
            {countdown}
            <span style={{ fontSize: 26, opacity: 0.4, marginLeft: 4 }}>s</span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginTop: 14 }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: "linear-gradient(to right, rgba(0,242,254,0.4), #00F2FE)",
              boxShadow: "0 0 8px rgba(0,242,254,0.6)",
              width: `${(countdown / countdownDuration) * 100}%`,
              transition: "width 1s linear",
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
