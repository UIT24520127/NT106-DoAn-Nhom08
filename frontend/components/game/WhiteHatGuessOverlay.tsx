"use client";
import { useEffect, useState } from "react";

interface WhiteHatGuessOverlayProps {
  isWhiteHat: boolean;
  pendingWinner?: string | null;
  onGuess: (word: string) => void;
}

export default function WhiteHatGuessOverlay({
  isWhiteHat,
  pendingWinner,
  onGuess,
}: WhiteHatGuessOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
    setSubmitted(true);
    onGuess(guess.trim());
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(120,0,0,0.85)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 300,
      animation: "flashRed 0.3s ease",
    }}>
      <style>{`
        @keyframes flashRed {
          0% { background: rgba(255,0,0,0.9); }
          100% { background: rgba(120,0,0,0.85); }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>

      <div style={{
        background: "linear-gradient(135deg, #1a0000, #2a0505)",
        border: "2px solid rgba(239,68,68,0.6)",
        borderRadius: 28, padding: "44px 52px",
        textAlign: "center", maxWidth: 460, width: "90%",
        boxShadow: "0 0 80px rgba(239,68,68,0.4), 0 20px 60px rgba(0,0,0,0.8)",
      }}>
        {/* Warning icon */}
        <div style={{ fontSize: 56, marginBottom: 12, animation: "shake 0.6s ease infinite" }}>
          ⚠️
        </div>

        <h2 style={{
          fontSize: 22, fontWeight: 900, color: "#ff4444",
          textShadow: "0 0 20px rgba(255,68,68,0.8)",
          textTransform: "uppercase", letterSpacing: "0.1em",
          margin: "0 0 8px",
        }}>
          {isWhiteHat ? "CƠ HỘI CUỐI CÙNG!" : "⏸️ GAME TẠM DỪNG"}
        </h2>

        {/* Timer */}
        <div style={{
          fontSize: 52, fontWeight: 900,
          color: timeLeft <= 10 ? "#ff2222" : "#ff8888",
          textShadow: "0 0 24px rgba(255,68,68,0.7)",
          letterSpacing: "0.08em", margin: "12px 0",
          fontFamily: "'Courier New', monospace",
          animation: timeLeft <= 10 ? "shake 0.4s ease infinite" : "none",
        }}>
          {String(timeLeft).padStart(2, "0")}s
        </div>

        {isWhiteHat ? (
          <>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, margin: "0 0 24px", lineHeight: 1.6 }}>
              Phe{" "}
              <span style={{ color: "#e6a822", fontWeight: 800 }}>
                {pendingWinner === "BlackHat" ? "Mũ Đen" : "Dân Thường"}
              </span>
              {" "}sắp thắng.{" "}
              <br />
              Đoán đúng từ khóa của Dân để <strong style={{ color: "#fff" }}>lật kèo</strong>!
            </p>

            {submitted ? (
              <div style={{
                padding: "14px 24px",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 14, color: "rgba(255,255,255,0.5)", fontSize: 14,
              }}>
                Đã gửi câu trả lời... Chờ kết quả
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  autoFocus
                  type="text"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Nhập từ khóa của Dân..."
                  style={{
                    flex: 1, padding: "13px 18px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1.5px solid rgba(255,100,100,0.4)",
                    borderRadius: 14, color: "#fff", fontSize: 15,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!guess.trim()}
                  style={{
                    padding: "13px 20px", borderRadius: 14, border: "none",
                    background: guess.trim()
                      ? "linear-gradient(135deg, #e6a822, #d4941a)"
                      : "rgba(255,255,255,0.06)",
                    color: guess.trim() ? "#000" : "rgba(255,255,255,0.3)",
                    fontWeight: 800, fontSize: 14, cursor: guess.trim() ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap",
                  }}
                >
                  🎯 Đoán
                </button>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: 0, lineHeight: 1.8 }}>
            Mũ Trắng đang dùng cơ hội cuối cùng để đoán từ khóa.
            <br />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              Đừng tiết lộ bất kỳ thông tin gì...
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
