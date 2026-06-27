"use client";
import { useEffect, useState, useRef } from "react";
import { useGameSound } from "@/hooks/useGameSound";

interface CountdownTimerProps {
  /** Unix milliseconds timestamp khi vote kết thúc */
  endTime: number;
  onExpired?: () => void;
}

export default function CountdownTimer({ endTime, onExpired }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const onExpiredRef = useRef(onExpired);
  const gameSounds = useGameSound();
  const gameSoundsRef = useRef(gameSounds);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    gameSoundsRef.current = gameSounds;
  }, [gameSounds]);

  useEffect(() => {
    const calc = () => Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    setTimeLeft(calc());

    const interval = setInterval(() => {
      const remaining = calc();
      setTimeLeft(remaining);

      // Phát âm thanh tick trong 10 giây cuối
      if (remaining <= 10 && remaining > 0) {
        if (gameSoundsRef.current.playTick) gameSoundsRef.current.playTick();
      }

      if (remaining === 0) {
        clearInterval(interval);
        onExpiredRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isDanger = timeLeft <= 30;

  return (
    <div
      style={{
        fontFamily: "'Orbitron', 'Courier New', monospace",
        fontSize: "3rem",
        fontWeight: 900,
        letterSpacing: "0.08em",
        color: isDanger ? "#ff4444" : "#e6a822",
        textShadow: isDanger
          ? "0 0 20px rgba(255,68,68,0.8), 0 0 40px rgba(255,68,68,0.4)"
          : "0 0 20px rgba(230,168,34,0.6), 0 0 40px rgba(230,168,34,0.3)",
        animation: isDanger && timeLeft <= 10 ? "pulseRed 0.8s ease-in-out infinite" : "none",
        transition: "color 0.3s, text-shadow 0.3s",
      }}
    >
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      <style>{`
        @keyframes pulseRed {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
