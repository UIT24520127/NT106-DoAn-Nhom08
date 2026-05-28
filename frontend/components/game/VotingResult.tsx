"use client";
import { useEffect, useState } from "react";

interface VotingResultProps {
  isDraw: boolean;
  eliminatedDisplayName?: string | null;
  /** Tự động ẩn sau N giây */
  autoDismissSeconds?: number;
  onDismiss?: () => void;
}

export default function VotingResult({
  isDraw,
  eliminatedDisplayName,
  autoDismissSeconds = 3,
  onDismiss,
}: VotingResultProps) {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(autoDismissSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setVisible(false);
          onDismiss?.();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoDismissSeconds, onDismiss]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200,
        animation: "fadeInScale 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div style={{
        background: "linear-gradient(135deg, #1a1a2e, #0d0d1a)",
        border: isDraw
          ? "2px solid rgba(230,168,34,0.4)"
          : "2px solid rgba(239,68,68,0.5)",
        borderRadius: 28,
        padding: "48px 56px",
        textAlign: "center",
        maxWidth: 440,
        width: "90%",
        boxShadow: isDraw
          ? "0 0 60px rgba(230,168,34,0.2), 0 20px 60px rgba(0,0,0,0.6)"
          : "0 0 60px rgba(239,68,68,0.2), 0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 64, marginBottom: 16, lineHeight: 1 }}>
          {isDraw ? "🤝" : "☠️"}
        </div>

        <h2 style={{
          fontSize: 26, fontWeight: 900, margin: "0 0 12px",
          color: isDraw ? "#e6a822" : "#ef4444",
          textShadow: isDraw
            ? "0 0 20px rgba(230,168,34,0.6)"
            : "0 0 20px rgba(239,68,68,0.6)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {isDraw ? "HÒA!" : "BỊ LOẠI!"}
        </h2>

        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, margin: "0 0 24px", lineHeight: 1.5 }}>
          {isDraw
            ? "Không ai bị loại — Tiếp tục miêu tả!"
            : <>
                <span style={{ color: "#fff", fontWeight: 800 }}>{eliminatedDisplayName}</span>
                {" "}đã bị loại khỏi game.
              </>
          }
        </p>

        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.3)",
          letterSpacing: "0.1em",
        }}>
          Tiếp tục sau {countdown}s...
        </div>

        {/* Progress bar */}
        <div style={{
          marginTop: 16,
          height: 3,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 99,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            background: isDraw ? "#e6a822" : "#ef4444",
            borderRadius: 99,
            width: `${(countdown / autoDismissSeconds) * 100}%`,
            transition: "width 1s linear",
          }} />
        </div>
      </div>
    </div>
  );
}
