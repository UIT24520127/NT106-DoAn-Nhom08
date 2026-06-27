"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Lock, Mic, MicOff, Send, SkipForward, Volume2, VolumeX } from "lucide-react";

interface DescribingPlayer {
  userId: string;
  displayName: string;
  isEliminated: boolean;
  isMicActive?: boolean;
}

interface DescribingPhaseProps {
  players: DescribingPlayer[];
  turnOrder: string[];
  currentTurnIndex: number;
  myUserId: string;
  myRole: string;
  myWord: string;
  roundNumber: number;
  describeDuration?: number;
  turnEndTime?: number;
  onSkipTurn: () => void;
  onSubmitDescription: (text: string, source: "typed" | "speech") => void;
  backgroundImage?: string;
  typingSync?: Record<string, { text: string; isFinal: boolean }>;
  onTyping?: (text: string) => void;
}

const ROLE_COLOR: Record<string, string> = {
  Civilian: "#22c55e",
  BlackHat: "#ef4444",
  WhiteHat: "#e2e8f0",
};

function SpeakingRipple({ color }: { color: string }) {
  return (
    <>
      {[0, 0.35, 0.7].map((delay, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: -(i + 1) * 10,
            borderRadius: "50%",
            border: `1.5px solid ${color}`,
            animation: `dp-ripple 1.55s ease-out ${delay}s infinite`,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

export default function DescribingPhase({
  players,
  turnOrder,
  currentTurnIndex,
  myUserId,
  myRole,
  myWord,
  roundNumber,
  describeDuration = 30,
  turnEndTime,
  onSkipTurn,
  onSubmitDescription,
  backgroundImage,
  typingSync,
  onTyping,
}: DescribingPhaseProps) {
  const [timeLeft, setTimeLeft] = useState(describeDuration);
  const [wordVisible, setWordVisible] = useState(false);
  const [descriptionText, setDescriptionText] = useState("");
  const [descriptionSource, setDescriptionSource] = useState<"typed" | "speech">("typed");
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const skipCooldown = useRef(false);
  const recognitionRef = useRef<any>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const alivePlayers = useMemo(() => players.filter(p => !p.isEliminated), [players]);
  const eliminatedPlayers = useMemo(() => players.filter(p => p.isEliminated), [players]);
  const orderedAlive = useMemo(() => {
    return turnOrder
      .map(uid => alivePlayers.find(p => p.userId === uid))
      .filter(Boolean) as DescribingPlayer[];
  }, [alivePlayers, turnOrder]);

  const currentSpeakerId = turnOrder[currentTurnIndex] ?? null;
  const isMyTurn = currentSpeakerId === myUserId;
  const currentPlayer = orderedAlive[currentTurnIndex];
  const myColor = ROLE_COLOR[myRole] ?? "#22d3ee";

  const descriptionTextRef = useRef(descriptionText);
  const descriptionSourceRef = useRef(descriptionSource);
  const isMyTurnRef = useRef(isMyTurn);

  useEffect(() => {
    descriptionTextRef.current = descriptionText;
    descriptionSourceRef.current = descriptionSource;
    isMyTurnRef.current = isMyTurn;
  }, [descriptionText, descriptionSource, isMyTurn]);

  const onSkipTurnRef = useRef(onSkipTurn);
  const onSubmitDescriptionRef = useRef(onSubmitDescription);
  useEffect(() => {
    onSkipTurnRef.current = onSkipTurn;
    onSubmitDescriptionRef.current = onSubmitDescription;
  }, [onSkipTurn, onSubmitDescription]);

  const hasAutoSubmitted = useRef(false);
  useEffect(() => {
    hasAutoSubmitted.current = false;
  }, [currentTurnIndex]);

  useEffect(() => {
    let initialRemaining = describeDuration;
    if (turnEndTime) {
      initialRemaining = Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000));
    }
    setTimeLeft(initialRemaining);

    const interval = window.setInterval(() => {
      let remaining = describeDuration;
      if (turnEndTime) {
        remaining = Math.max(0, Math.ceil((turnEndTime - Date.now()) / 1000));
      } else {
        // Fallback if turnEndTime is somehow not provided (e.g. waiting for TurnStarted)
        // Just keep showing the describeDuration, don't tick down yet
        return;
      }

      setTimeLeft(remaining);

      if (remaining === 0) {
        window.clearInterval(interval);

        // Auto-submit logic when timer naturally hits 0
        if (isMyTurnRef.current && !hasAutoSubmitted.current) {
          hasAutoSubmitted.current = true;
          window.setTimeout(() => {
            const text = descriptionTextRef.current.trim();
            if (!text) {
              onSkipTurnRef.current();
            } else {
              onSubmitDescriptionRef.current(text, descriptionSourceRef.current);
            }
          }, 100);
        }
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [currentTurnIndex, describeDuration, turnEndTime]);

  useEffect(() => {
    setDescriptionText("");
    setDescriptionSource("typed");
    setSpeechError("");
    setIsListening(false);
    recognitionRef.current?.stop?.();
  }, [currentTurnIndex]);

  const visiblePlayers = useMemo(() => {
    const result: { player: DescribingPlayer; offset: number }[] = [];
    for (let offset = -2; offset <= 2; offset++) {
      const idx = currentTurnIndex + offset;
      if (idx >= 0 && idx < orderedAlive.length) {
        result.push({ player: orderedAlive[idx], offset });
      }
    }
    return result;
  }, [currentTurnIndex, orderedAlive]);

  const handleSkip = () => {
    if (skipCooldown.current || !isMyTurn) return;
    skipCooldown.current = true;
    onSkipTurn();
    window.setTimeout(() => {
      skipCooldown.current = false;
    }, 2000);
  };

  const handleSubmit = () => {
    if (!isMyTurn) return;
    const text = descriptionText.trim();
    if (!text) {
      setSpeechError("Nhap mo ta truoc khi gui.");
      return;
    }
    recognitionRef.current?.stop?.();
    setIsListening(false);
    onSubmitDescription(text, descriptionSource);
    setDescriptionText("");
    setDescriptionSource("typed");
  };

  const startSpeechToText = () => {
    if (!isMyTurn || typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError("Trinh duyet nay chua ho tro voice-to-text.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    setSpeechError("");
    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      setDescriptionText(transcript);
      setDescriptionSource("speech");
      onTyping?.(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setSpeechError("Khong nghe duoc noi dung, thu lai hoac go bang tay.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const isDanger = timeLeft <= 10;
  const isWarning = timeLeft <= 20;
  const timerColor = isDanger ? "#ef4444" : isWarning ? "#f59e0b" : "#22d3ee";
  const barPct = Math.max(0, Math.min(100, (timeLeft / describeDuration) * 100));

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.9) 0%, rgba(7,9,17,0.62) 42%, rgba(5,6,12,0.96) 100%), url(${backgroundImage ?? "/bg1.jpg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'Nunito', 'Inter', sans-serif",
        position: "relative",
        overflow: "hidden",
        padding: "22px 18px 132px",
      }}
    >
      <style>{`
        @keyframes dp-ripple {
          0% { transform: scale(0.72); opacity: 0.78; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        @keyframes dp-pulse-timer {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.055); }
        }
        @keyframes dp-card-glow {
          0%, 100% { box-shadow: 0 0 34px rgba(34,211,238,0.26), 0 22px 80px rgba(0,0,0,0.42); }
          50% { box-shadow: 0 0 68px rgba(34,211,238,0.46), 0 22px 80px rgba(0,0,0,0.42); }
        }
        @keyframes dp-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (max-width: 680px) {
          .describe-topbar { padding-top: 62px !important; gap: 10px !important; }
          .describe-card { transform: translateX(calc(var(--offset) * 96px)) scale(var(--scale)) !important; }
          .describe-timer { font-size: 68px !important; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 60,
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${barPct}%`,
            background: `linear-gradient(90deg, ${timerColor}66, ${timerColor})`,
            boxShadow: `0 0 14px ${timerColor}`,
            transition: "width 1s linear, background 0.3s",
          }}
        />
      </div>

      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 44% 38% at 50% 42%, rgba(34,211,238,0.18) 0%, rgba(34,211,238,0.04) 42%, transparent 72%)",
          zIndex: 0,
        }}
      />

      <div
        className="describe-topbar"
        style={{
          width: "min(100%, 880px)",
          display: "grid",
          gridTemplateColumns: "1fr minmax(220px, 380px) 1fr",
          alignItems: "start",
          gap: 20,
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", gridColumn: 2 }}>
          <p
            style={{
              color: "rgba(255,255,255,0.28)",
              fontSize: 10,
              letterSpacing: "0.36em",
              textTransform: "uppercase",
              margin: "0 0 4px",
              fontWeight: 800,
            }}
          >
            Lượt miêu tả
          </p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: 22, margin: 0 }}>
            Vòng <span style={{ color: "#22d3ee" }}>{roundNumber}</span>
            <span style={{ color: "rgba(255,255,255,0.34)", fontSize: 13, marginLeft: 8 }}>
              {currentTurnIndex + 1}/{Math.max(orderedAlive.length, 1)}
            </span>
          </h2>
        </div>

        <button
          onClick={() => setWordVisible(v => !v)}
          style={{
            justifySelf: "end",
            minWidth: 164,
            maxWidth: 220,
            height: 44,
            padding: "0 16px",
            borderRadius: 999,
            cursor: "pointer",
            background: wordVisible ? `${myColor}18` : "rgba(255,255,255,0.055)",
            border: `1px dashed ${wordVisible ? myColor + "75" : "rgba(255,255,255,0.13)"}`,
            color: wordVisible ? myColor : "rgba(255,255,255,0.36)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backdropFilter: "blur(14px)",
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: "0.05em",
          }}
          title="Xem từ khóa"
        >
          <Lock size={14} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              filter: wordVisible ? "none" : "blur(5px)",
              transition: "filter 0.2s",
            }}
          >
            {myRole === "WhiteHat" ? "Không có từ khóa" : myWord || "Từ khóa"}
          </span>
        </button>
      </div>

      <div style={{ zIndex: 1, textAlign: "center", marginTop: 34, marginBottom: 12 }}>
        <div
          className="describe-timer"
          style={{
            fontSize: 86,
            fontWeight: 900,
            lineHeight: 1,
            color: timerColor,
            textShadow: `0 0 24px ${timerColor}99, 0 0 80px ${timerColor}42`,
            fontFamily: "'Courier New', monospace",
            animation: isDanger ? "dp-pulse-timer 0.5s ease-in-out infinite" : "none",
          }}
        >
          {String(timeLeft).padStart(2, "0")}
          <span style={{ fontSize: 28, opacity: 0.48, marginLeft: 4 }}>s</span>
        </div>
      </div>

      <div style={{ zIndex: 1, marginBottom: 28, minHeight: 26 }}>
        {isMyTurn ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              borderRadius: 999,
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.38)",
              color: "#22c55e",
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: "0.08em",
              boxShadow: "0 0 22px rgba(34,197,94,0.24)",
            }}
          >
            Đến lượt bạn
          </div>
        ) : (
          <p style={{ color: "rgba(255,255,255,0.56)", fontSize: 15, fontWeight: 800, margin: 0 }}>
            <span style={{ color: "#fff" }}>{currentPlayer?.displayName ?? "..."}</span> đang miêu tả
          </p>
        )}
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 860,
          minHeight: 250,
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {visiblePlayers.map(({ player, offset }) => {
          const isActive = offset === 0;
          const abs = Math.abs(offset);
          const scale = isActive ? 1 : abs === 1 ? 0.72 : 0.54;
          const opacity = isActive ? 1 : abs === 1 ? 0.45 : 0.18;
          const pColor = isActive ? "#22d3ee" : "#64748b";
          const isSpeaking = isActive;

          return (
            <div
              key={player.userId}
              className="describe-card"
              style={{
                ["--offset" as any]: offset,
                ["--scale" as any]: scale,
                position: "absolute",
                transform: `translateX(${offset * 200}px) scale(${scale})`,
                opacity,
                zIndex: isActive ? 10 : 5 - abs,
                transition: "all 0.48s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              {typingSync?.[player.userId]?.text && (
                <div style={{
                  position: 'absolute',
                  bottom: '90%',
                  left: '75%',
                  background: typingSync[player.userId].isFinal
                    ? 'linear-gradient(135deg, rgba(34,197,94,0.9), rgba(22,163,74,0.95))'
                    : 'linear-gradient(135deg, rgba(14,23,38,0.95), rgba(8,14,24,0.98))',
                  color: typingSync[player.userId].isFinal ? '#000' : '#22d3ee',
                  border: `1px solid ${typingSync[player.userId].isFinal ? '#4ade80' : 'rgba(34,211,238,0.4)'}`,
                  padding: '10px 18px',
                  borderRadius: '16px 16px 16px 4px',
                  fontWeight: 800,
                  fontSize: 14,
                  pointerEvents: 'none',
                  boxShadow: typingSync[player.userId].isFinal
                    ? '0 8px 24px rgba(34,197,94,0.3)'
                    : '0 8px 24px rgba(34,211,238,0.2)',
                  zIndex: 20,
                  transition: 'all 0.2s',
                  width: 'max-content',
                  maxWidth: 220,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {typingSync[player.userId].text}
                  {!typingSync[player.userId].isFinal && <span style={{ animation: 'dp-blink 1s infinite', marginLeft: 2, color: '#fff' }}>|</span>}
                </div>
              )}
              <div
                style={{
                  width: isActive ? 280 : 180,
                  minHeight: isActive ? 320 : 180,
                  borderRadius: 32,
                  padding: isActive ? "36px 24px" : "20px 16px",
                  background: isActive
                    ? "linear-gradient(160deg, rgba(12,25,34,0.78), rgba(8,10,20,0.82))"
                    : "rgba(13,16,28,0.46)",
                  border: isActive ? "1.5px solid rgba(34,211,238,0.38)" : "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(18px)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 18,
                  animation: isActive ? "dp-card-glow 2.8s ease-in-out infinite" : "none",
                }}
              >
                <div style={{ position: "relative" }}>
                  {isSpeaking && <SpeakingRipple color={isMyTurn ? "#22c55e" : "#22d3ee"} />}
                  <div
                    style={{
                      width: isActive ? 120 : 70,
                      height: isActive ? 120 : 70,
                      borderRadius: "50%",
                      background: `radial-gradient(circle at 35% 35%, ${pColor}35, #0b1020)`,
                      border: `3px solid ${pColor}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: pColor,
                      fontSize: isActive ? 48 : 24,
                      fontWeight: 900,
                      boxShadow: isActive ? `0 0 28px ${pColor}66` : "none",
                      overflow: "hidden",
                    }}
                  >
                    {player.avatar ? (
                      <img src={player.avatar} alt={player.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      player.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "center", width: "100%" }}>
                  <div
                    style={{
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: isActive ? 18 : 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {player.displayName}
                  </div>
                  {player.userId === myUserId && (
                    <div style={{ color: "#22d3ee", fontSize: 10, marginTop: 3, fontWeight: 800 }}>
                      Bạn
                    </div>
                  )}
                </div>

                {isActive ? (
                  <div
                    style={{
                      padding: "8px 20px",
                      borderRadius: 999,
                      background: "rgba(34,211,238,0.12)",
                      border: "1px solid rgba(34,211,238,0.32)",
                      color: "#22d3ee",
                      fontSize: 12,
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                    }}
                  >
                    ĐANG NÓI
                  </div>
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.32)", fontSize: 11, fontWeight: 700 }}>
                    #{turnOrder.indexOf(player.userId) + 1}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>



      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 55,
          padding: "18px 20px 28px",
          background: "linear-gradient(to top, rgba(4,5,10,0.98), rgba(4,5,10,0.82) 68%, transparent)",
        }}
      >
        <div
          style={{
            width: "min(780px, 100%)",
            margin: "0 auto",
            borderRadius: 18,
            padding: 12,
            background: "rgba(8,10,20,0.78)",
            border: isMyTurn ? "1px solid rgba(34,197,94,0.28)" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: isMyTurn ? "0 16px 48px rgba(34,197,94,0.14)" : "0 16px 48px rgba(0,0,0,0.34)",
            backdropFilter: "blur(18px)",
          }}
        >
          {isMyTurn ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "rgba(255,255,255,0.42)", fontSize: 12, fontWeight: 800 }}>
                <Keyboard size={14} />
                <span>Nhập mô tả ngắn gọn, hoặc dùng voice-to-text rồi gửi.</span>
                <span style={{ marginLeft: "auto", color: descriptionSource === "speech" ? "#22d3ee" : "rgba(255,255,255,0.3)" }}>
                  {descriptionSource === "speech" ? "VOICE" : "TYPED"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center" }}>
                <input
                  value={descriptionText}
                  onChange={e => {
                    const val = e.target.value;
                    setDescriptionText(val);
                    setDescriptionSource("typed");
                    setSpeechError("");
                    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = window.setTimeout(() => {
                      onTyping?.(val);
                    }, 150);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                  maxLength={80}
                  placeholder="Nhập từ/cụm từ mô tả..."
                  style={{
                    height: 48,
                    minWidth: 0,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    outline: "none",
                    padding: "0 16px",
                    fontSize: 15,
                    fontWeight: 800,
                    fontFamily: "'Nunito', 'Inter', sans-serif",
                  }}
                />

                <button
                  onClick={startSpeechToText}
                  title="Voice to text"
                  style={{
                    height: 48,
                    padding: "0 18px",
                    borderRadius: 14,
                    border: `1px solid ${isListening ? "rgba(239,68,68,0.46)" : "rgba(34,211,238,0.32)"}`,
                    background: isListening ? "rgba(239,68,68,0.14)" : "rgba(34,211,238,0.1)",
                    color: isListening ? "#ef4444" : "#22d3ee",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 14,
                    transition: "all 0.2s"
                  }}
                >
                  {isListening ? (
                    <>
                      <MicOff size={18} /> Đang nghe...
                    </>
                  ) : (
                    <>
                      <Mic size={18} /> Nói (Voice)
                    </>
                  )}
                </button>



                <button
                  onClick={handleSubmit}
                  style={{
                    height: 48,
                    minWidth: 112,
                    borderRadius: 14,
                    border: "none",
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    color: "#03140a",
                    fontWeight: 900,
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                    boxShadow: "0 10px 28px rgba(34,197,94,0.28)",
                  }}
                >
                  <Send size={16} /> GỬI
                </button>
              </div>

              {speechError && (
                <div style={{ marginTop: 8, color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>
                  {speechError}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                minHeight: 56,
                borderRadius: 14,
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.34)",
                fontSize: 14,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "0 16px",
              }}
            >
              Chờ {currentPlayer?.displayName ?? "người chơi"} gửi mô tả...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
