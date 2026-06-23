"use client";

import { CheckCircle2, Eye, Loader2, ShieldAlert, Timer } from "lucide-react";

interface LoadingPlayer {
  userId: string;
  displayName: string;
  isSpectator?: boolean;
}

interface LoadingPhaseScreenProps {
  players: LoadingPlayer[];
  readyPlayerIds: string[];
  readyCount: number;
  totalCount: number;
  secondsLeft: number;
  isMeReady: boolean;
  isSpectator: boolean;
  spectatorReason?: string;
  backgroundImage?: string;
}

export default function LoadingPhaseScreen({
  players,
  readyPlayerIds,
  readyCount,
  totalCount,
  secondsLeft,
  isMeReady,
  isSpectator,
  spectatorReason,
  backgroundImage,
}: LoadingPhaseScreenProps) {
  const readySet = new Set(readyPlayerIds);
  const progress = totalCount > 0 ? Math.min(100, Math.round((readyCount / totalCount) * 100)) : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.92), rgba(7,9,17,0.66) 44%, rgba(4,5,10,0.96)), url(${backgroundImage ?? "/bg1.jpg"})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "'Nunito', 'Inter', sans-serif",
        color: "#fff",
        overflow: "hidden",
        zIndex: 120,
      }}
    >
      <style>{`
        @keyframes loading-spin { to { transform: rotate(360deg); } }
        @keyframes loading-enter {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loading-bar {
          0% { background-position: 160% center; }
          100% { background-position: -160% center; }
        }
        @media (max-width: 640px) {
          .loading-panel { padding: 22px 18px !important; }
          .loading-title { font-size: 24px !important; }
          .loading-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 54% 44% at 50% 36%, rgba(34,211,238,0.16), transparent 72%)",
        }}
      />

      <section
        className="loading-panel"
        style={{
          width: "min(620px, 100%)",
          borderRadius: 20,
          padding: "28px 30px",
          background: "rgba(8,10,20,0.74)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
          backdropFilter: "blur(22px)",
          position: "relative",
          animation: "loading-enter 0.35s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: isSpectator ? "rgba(245,158,11,0.12)" : "rgba(34,211,238,0.13)",
              border: `1px solid ${isSpectator ? "rgba(245,158,11,0.34)" : "rgba(34,211,238,0.35)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isSpectator ? "#f59e0b" : "#22d3ee",
              boxShadow: `0 0 26px ${isSpectator ? "rgba(245,158,11,0.22)" : "rgba(34,211,238,0.24)"}`,
              flexShrink: 0,
            }}
          >
            {isSpectator ? <Eye size={25} /> : <Loader2 size={26} style={{ animation: "loading-spin 1s linear infinite" }} />}
          </div>

          <div style={{ minWidth: 0 }}>
            <p
              style={{
                color: "rgba(255,255,255,0.34)",
                fontSize: 11,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                margin: "0 0 4px",
                fontWeight: 900,
              }}
            >
              Loading sync
            </p>
            <h1
              className="loading-title"
              style={{
                margin: 0,
                fontSize: 30,
                lineHeight: 1.12,
                fontWeight: 900,
                color: "#fff",
              }}
            >
              {isSpectator ? "Bạn đang quan sát ván chơi" : isMeReady ? "Bạn đã sẵn sàng" : "Đang chuẩn bị ván chơi"}
            </h1>
          </div>
        </div>

        {isSpectator ? (
          <div
            style={{
              borderRadius: 14,
              padding: "14px 16px",
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: "rgba(255,255,255,0.82)",
              fontSize: 14,
              lineHeight: 1.55,
              marginBottom: 18,
            }}
          >
            <strong style={{ color: "#fbbf24" }}>Kết nối của bạn hơi chậm.</strong>{" "}
            {spectatorReason || "Bạn sẽ quan sát ván này và tham gia lại ở ván sau."}
          </div>
        ) : (
          <p
            style={{
              color: "rgba(255,255,255,0.58)",
              fontSize: 14,
              lineHeight: 1.55,
              margin: "0 0 18px",
            }}
          >
            {isMeReady ? "Đang chờ người chơi còn lại vào màn hình game." : "Vui lòng chờ mọi người vào game và đồng bộ trạng thái."}
          </p>
        )}

        <div
          style={{
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 999,
              background:
                "linear-gradient(100deg, rgba(34,211,238,0.65), #22d3ee, rgba(34,197,94,0.85), #22d3ee)",
              backgroundSize: "220% auto",
              animation: "loading-bar 2.2s linear infinite",
              boxShadow: "0 0 18px rgba(34,211,238,0.42)",
              transition: "width 0.28s ease",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#22d3ee",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            <CheckCircle2 size={16} />
            {readyCount}/{totalCount || players.length} người đã sẵn sàng
          </div>

          {!isSpectator && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                color: secondsLeft <= 3 ? "#f59e0b" : "rgba(255,255,255,0.62)",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <Timer size={15} />
              Còn {Math.max(0, secondsLeft)}s
            </div>
          )}
        </div>

        <div className="loading-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {players.map(player => {
            const isReady = readySet.has(player.userId);
            const spectator = Boolean(player.isSpectator);
            return (
              <div
                key={player.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: spectator
                    ? "rgba(245,158,11,0.08)"
                    : isReady
                      ? "rgba(34,197,94,0.09)"
                      : "rgba(255,255,255,0.045)",
                  border: spectator
                    ? "1px solid rgba(245,158,11,0.2)"
                    : isReady
                      ? "1px solid rgba(34,197,94,0.24)"
                      : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 900,
                    color: spectator ? "#f59e0b" : isReady ? "#22c55e" : "#94a3b8",
                    background: spectator ? "rgba(245,158,11,0.14)" : isReady ? "rgba(34,197,94,0.13)" : "rgba(148,163,184,0.12)",
                    border: `1px solid ${spectator ? "rgba(245,158,11,0.28)" : isReady ? "rgba(34,197,94,0.32)" : "rgba(148,163,184,0.18)"}`,
                  }}
                >
                  {player.displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {player.displayName}
                  </div>
                  <div
                    style={{
                      color: spectator ? "#f59e0b" : isReady ? "#22c55e" : "rgba(255,255,255,0.38)",
                      fontSize: 11,
                      fontWeight: 800,
                      marginTop: 1,
                    }}
                  >
                    {spectator ? "Quan sát" : isReady ? "Đã sẵn sàng" : "Đang tải..."}
                  </div>
                </div>
                {spectator ? <ShieldAlert size={16} color="#f59e0b" /> : isReady ? <CheckCircle2 size={16} color="#22c55e" /> : <Loader2 size={16} color="#94a3b8" style={{ animation: "loading-spin 1s linear infinite" }} />}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
