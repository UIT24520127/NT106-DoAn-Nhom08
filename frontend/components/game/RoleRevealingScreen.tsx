"use client";

import { useEffect, useState } from "react";

interface RoleRevealingScreenProps {
  role: string;
  word: string;
  backgroundImage?: string;
  onReadyToContinue?: () => void;
}

const ROLE_CONFIG: Record<string, {
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  glow: string;
  bg: string;
  border: string;
  goal: string;
}> = {
  Civilian: {
    label: "DÂN THƯỜNG",
    sublabel: "CIVILIAN",
    icon: "🏛️",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.55)",
    bg: "rgba(34,197,94,0.07)",
    border: "rgba(34,197,94,0.45)",
    goal: "Miêu tả khéo léo để đồng đội nhận ra bạn, nhưng đừng để đối thủ đoán được từ khóa.",
  },
  BlackHat: {
    label: "NỘI GIÁN",
    sublabel: "BLACK HAT",
    icon: "🎭",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.55)",
    bg: "rgba(239,68,68,0.07)",
    border: "rgba(239,68,68,0.45)",
    goal: "Hòa mình vào nhóm, đừng bị lộ. Sống sót cho đến khi số Nội Gián áp đảo phe Dân Thường.",
  },
  WhiteHat: {
    label: "MŨ TRẮNG",
    sublabel: "WHITE HAT",
    icon: "🤍",
    color: "#e2e8f0",
    glow: "rgba(226,232,240,0.45)",
    bg: "rgba(226,232,240,0.05)",
    border: "rgba(226,232,240,0.30)",
    goal: "Bạn không có từ khóa. Lắng nghe và đoán đúng từ khóa của Dân Thường để thắng.",
  },
};

export default function RoleRevealingScreen({
  role,
  word,
  backgroundImage,
  onReadyToContinue,
}: RoleRevealingScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [typedWord, setTypedWord] = useState("");

  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.Civilian;

  useEffect(() => {
    const timeout = window.setTimeout(() => setRevealed(true), 200);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!revealed || role === "WhiteHat") return;

    let i = 0;
    const interval = window.setInterval(() => {
      i += 1;
      setTypedWord(word.slice(0, i));
      if (i >= word.length) window.clearInterval(interval);
    }, 80);

    return () => window.clearInterval(interval);
  }, [revealed, role, word]);

  useEffect(() => {
    const interval = window.setInterval(() => setShowCursor(c => !c), 530);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!revealed) return;

    const wordRevealMs = role === "WhiteHat" ? 0 : Math.min(word.length * 80, 1600);
    const timeout = window.setTimeout(() => {
      onReadyToContinue?.();
    }, 4200 + wordRevealMs);

    return () => window.clearTimeout(timeout);
  }, [onReadyToContinue, revealed, role, word.length]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `linear-gradient(180deg, rgba(8,11,20,0.88), rgba(11,14,24,0.45)), url(${backgroundImage ?? "/bg1.jpg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        zIndex: 100,
        overflow: "hidden",
        padding: 20,
      }}
    >
      <style>{`
        @keyframes rr-fade-in-card {
          from { opacity: 0; transform: translateY(28px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rr-card-glow {
          0%, 100% { box-shadow: 0 0 40px ${cfg.glow}35, 0 24px 64px rgba(0,0,0,0.7); }
          50% { box-shadow: 0 0 72px ${cfg.glow}60, 0 24px 64px rgba(0,0,0,0.7); }
        }
        @keyframes rr-float-icon {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes rr-corner-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 55% 55% at 50% 55%, ${cfg.glow}18 0%, transparent 72%)`,
        }}
      />

      {[
        { top: 16, left: 16, rotate: "0deg" },
        { top: 16, right: 16, rotate: "90deg" },
        { bottom: 16, right: 16, rotate: "180deg" },
        { bottom: 16, left: 16, rotate: "270deg" },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            ...pos,
            width: 32,
            height: 32,
            borderTop: `2px solid ${cfg.color}`,
            borderLeft: `2px solid ${cfg.color}`,
            transform: `rotate(${pos.rotate})`,
            opacity: revealed ? 0.8 : 0,
            transition: "opacity 0.6s ease",
            animation: revealed ? "rr-corner-blink 3s ease-in-out infinite" : "none",
          }}
        />
      ))}

      <p
        style={{
          color: "rgba(255,255,255,0.35)",
          fontSize: 11,
          letterSpacing: "0.5em",
          textTransform: "uppercase",
          marginBottom: 24,
          zIndex: 1,
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.7s 0.2s ease",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "0 16px 8px",
        }}
      >
        NHẬN VAI TRÒ
      </p>

      <div
        style={{
          background: "rgba(10,11,20,0.82)",
          border: `1.5px solid ${cfg.border}`,
          borderRadius: 24,
          padding: "36px 44px 28px",
          maxWidth: 420,
          width: "90%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          position: "relative",
          zIndex: 1,
          backdropFilter: "blur(24px)",
          opacity: 0,
          animation: revealed
            ? "rr-fade-in-card 0.65s 0.15s cubic-bezier(0.34,1.56,0.64,1) forwards, rr-card-glow 3.5s 0.8s ease-in-out infinite"
            : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background: cfg.bg,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            fontSize: 64,
            lineHeight: 1,
            zIndex: 1,
            animation: revealed ? "rr-float-icon 3.2s ease-in-out infinite" : "none",
            filter: `drop-shadow(0 0 18px ${cfg.glow})`,
          }}
        >
          {cfg.icon}
        </div>

        <div style={{ textAlign: "center", zIndex: 1 }}>
          <p
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: 10.5,
              letterSpacing: "0.25em",
              margin: "0 0 4px",
              textTransform: "uppercase",
            }}
          >
            {cfg.sublabel}
          </p>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 900,
              margin: 0,
              color: cfg.color,
              textShadow: `0 0 28px ${cfg.glow}`,
              letterSpacing: "0.06em",
            }}
          >
            {cfg.label}
          </h1>
        </div>

        <div
          style={{
            width: "100%",
            height: 1,
            zIndex: 1,
            background: `linear-gradient(to right, transparent, ${cfg.border}, transparent)`,
          }}
        />

        <div style={{ width: "100%", textAlign: "center", zIndex: 1 }}>
          <p
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: 10,
              letterSpacing: "0.25em",
              margin: "0 0 10px",
              textTransform: "uppercase",
            }}
          >
            TỪ KHÓA BÍ MẬT
          </p>

          {role === "WhiteHat" ? (
            <div
              style={{
                padding: "14px 24px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.55)",
                fontSize: 15,
                fontStyle: "italic",
                letterSpacing: "0.05em",
              }}
            >
              Không có từ khóa
            </div>
          ) : (
            <div
              style={{
                padding: "14px 28px",
                borderRadius: 14,
                background: `linear-gradient(135deg, ${cfg.color}12, ${cfg.color}06)`,
                border: `1.5px solid ${cfg.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#fff",
                  letterSpacing: "0.1em",
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {typedWord}
                <span
                  style={{
                    opacity: showCursor ? 1 : 0,
                    color: cfg.color,
                    transition: "opacity 0.1s",
                  }}
                >
                  |
                </span>
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            zIndex: 1,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.28)",
              fontSize: 9.5,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              margin: "0 0 5px",
            }}
          >
            MỤC TIÊU
          </p>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
            {cfg.goal}
          </p>
        </div>
      </div>
    </div>
  );
}
