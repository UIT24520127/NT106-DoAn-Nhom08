"use client";
import { useState } from "react";

interface WhiteHatGuessOverlayProps {
  isWhiteHat: boolean;
  onGuess: (word: string) => void;
  onCancel: () => void;
}

export default function WhiteHatGuessOverlay({
  isWhiteHat,
  onGuess,
  onCancel,
}: WhiteHatGuessOverlayProps) {
  const [guess, setGuess] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!isWhiteHat) return null; // Chỉ hiển thị cho mũ trắng

  const handleSubmit = () => {
    if (!guess.trim() || submitted) return;
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
                onClick={onCancel}
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
