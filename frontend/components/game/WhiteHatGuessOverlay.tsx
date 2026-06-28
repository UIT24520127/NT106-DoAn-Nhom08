"use client";
import { useState, useEffect, useRef } from "react";
import { useGameSound } from "@/hooks/useGameSound";

interface WhiteHatGuessOverlayProps {
  isWhiteHat: boolean;
  onGuess: (word: string) => void;
  onCancel: () => void;
  initialTimeLeft?: number;
  whiteHatInfo?: { userId: string, displayName: string } | null;
}

export default function WhiteHatGuessOverlay({
  isWhiteHat,
  onGuess,
  onCancel,
  initialTimeLeft = 20,
  whiteHatInfo,
}: WhiteHatGuessOverlayProps) {
  const gameSounds = useGameSound();
  const { playClick, playStart, playAlert } = gameSounds;
  const gameSoundsRef = useRef(gameSounds);

  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);

  const [endTime] = useState(() => Date.now() + initialTimeLeft * 1000);

  useEffect(() => {
    gameSoundsRef.current = gameSounds;
  }, [gameSounds]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Play tick sound if White Hat in the last 5 seconds
      if (isWhiteHat && remaining <= 5 && remaining > 0) {
        if (gameSoundsRef.current.playTick) gameSoundsRef.current.playTick();
      }

      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endTime, timeLeft]);

  if (!isWhiteHat) {
    return (
      <div style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 300,
        animation: "fadeIn 0.3s ease",
      }}>
        <div style={{
          background: "linear-gradient(145deg, #1e293b, #0f172a)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 24, padding: "40px",
          textAlign: "center", maxWidth: 460, width: "90%",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(59,130,246,0.2)",
          position: "relative", overflow: "hidden"
        }}>
          {/* Decorative glow */}
          <div style={{
            position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%",
            background: "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 50%)",
            pointerEvents: "none"
          }} />

          <h2 style={{
            fontSize: 24, fontWeight: 900, color: "#f8fafc",
            letterSpacing: "0.05em", margin: "0 0 24px",
            textTransform: "uppercase",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)"
          }}>
            ĐANG CHỜ MŨ TRẮNG...
          </h2>
          
          {whiteHatInfo && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px", margin: "0 auto 24px",
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 12, width: "100%", maxWidth: 280
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: "bold", color: "#fff",
                boxShadow: "0 4px 20px rgba(59,130,246,0.4)",
                border: "2px solid rgba(255,255,255,0.2)"
              }}>
                {whiteHatInfo.displayName?.charAt(0)?.toUpperCase() || 'M'}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 700, color: "#fff",
                letterSpacing: "0.5px"
              }}>
                {whiteHatInfo.displayName || "Mũ Trắng"}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: "#94a3b8",
                background: "rgba(255,255,255,0.1)",
                padding: "4px 12px", borderRadius: 12,
                textTransform: "uppercase"
              }}>
                Mũ Trắng
              </div>
            </div>
          )}

          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, margin: "0", lineHeight: 1.6 }}>
            {whiteHatInfo ? `${whiteHatInfo.displayName || "Mũ Trắng"} đang sử dụng quyền đoán từ khóa cuối cùng.` : "Mũ Trắng đang sử dụng quyền đoán từ khóa cuối cùng."} Hãy chờ xem kết quả nhé!
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
    playClick();
    setSubmitted(true);
    onGuess(guess.trim());
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 300,
      animation: "fadeIn 0.2s ease",
    }}>
      <style>{`
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>

      <div style={{
        background: "linear-gradient(135deg, #1e293b, #0f172a)",
        border: "2px solid rgba(255,255,255,0.1)",
        borderRadius: 24, padding: "32px 40px",
        textAlign: "center", maxWidth: 420, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <h2 style={{
          fontSize: 22, fontWeight: 900, color: "#f8fafc",
          letterSpacing: "0.05em", margin: "0 0 12px",
        }}>
          ĐOÁN TỪ KHÓA
        </h2>

        <div style={{
          fontSize: 48, fontWeight: 900, color: timeLeft <= 5 ? "#ef4444" : "#eab308",
          textShadow: "0 0 20px rgba(0,0,0,0.5)",
          margin: "0 0 16px",
          fontVariantNumeric: "tabular-nums",
        }}>
          {timeLeft}s
        </div>

        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          Nhập từ khóa của Dân Thường. Nếu đoán đúng, bạn sẽ <strong style={{ color: "#22c55e" }}>lập tức chiến thắng</strong>!
          <br />
          <span style={{ color: "#ef4444" }}>Cảnh báo: Nếu đoán sai, bạn sẽ bị loại ngay lập tức.</span>
        </p>

        {submitted ? (
          <div style={{
            padding: "14px 24px",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 14, color: "rgba(255,255,255,0.5)", fontSize: 14,
          }}>
            Đã gửi câu trả lời...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input
              autoFocus
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Nhập từ khóa..."
              style={{
                width: "100%", padding: "14px 18px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 14, color: "#fff", fontSize: 15,
                outline: "none",
                textAlign: "center"
              }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => { playClick(); onCancel(); }}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.7)",
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}
              >
                Hủy
              </button>
              <button
                onClick={handleSubmit}
                disabled={!guess.trim()}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                  background: guess.trim()
                    ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                    : "rgba(255,255,255,0.05)",
                  color: guess.trim() ? "#fff" : "rgba(255,255,255,0.3)",
                  fontWeight: 800, fontSize: 14, cursor: guess.trim() ? "pointer" : "not-allowed",
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
