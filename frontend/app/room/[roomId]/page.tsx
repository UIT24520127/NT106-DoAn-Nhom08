"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { Users, LogOut, Play, Crown, CheckCircle2, XCircle, Settings, Clock, Vote, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";
import { getSignalRConnection } from "@/lib/signalRConnection";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import FriendModal from "@/components/friends/FriendModal";

interface RoomSettings {
  maxPlayers: number;
  maxBlackHats: number;
  maxWhiteHats: number;
  describeDuration: number;
  voteDuration: number;
  revealEliminatedRole: boolean;
  roundTransitionDuration: number;
}

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isFriendOpen, setIsFriendOpen] = useState(false);
  const [token, setToken] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<RoomSettings>>({
    describeDuration: 30,
    voteDuration: 60,
    revealEliminatedRole: true,
    roundTransitionDuration: 5,
  });

  useEffect(() => {
    const storedToken = sessionStorage.getItem("token") || "";
    const currentUserId = sessionStorage.getItem("userId") || "";
    setUserId(currentUserId);
    setToken(storedToken);

    const connection = getSignalRConnection(storedToken);
    setHubConnection(connection);

    connection.off("RoomUpdated");
    connection.off("GameStarted");
    connection.off("LoadingPhaseStarted");
    connection.off("RoomError");
    connection.off("KickedFromRoom");

    connection.on("RoomUpdated", (room: any) => {
      setRoomState(room);
      if (room.settings) {
        setLocalSettings({
          describeDuration: room.settings.describeDuration ?? 30,
          voteDuration: room.settings.voteDuration ?? 60,
          revealEliminatedRole: room.settings.revealEliminatedRole ?? true,
          roundTransitionDuration: room.settings.roundTransitionDuration ?? 5,
        });
      }
    });

    connection.on("GameStarted", (room: any) => {
      router.push(`/game/${room.roomId}`);
    });

    connection.on("LoadingPhaseStarted", (data: { timeoutSeconds?: number; totalCount?: number; startedAt?: number }) => {
      const roomCode = Array.isArray(roomId) ? roomId[0] : String(roomId ?? "");
      sessionStorage.setItem(`loading:${roomCode}`, JSON.stringify({
        timeoutSeconds: data.timeoutSeconds ?? 10,
        totalCount: data.totalCount ?? 0,
        startedAt: data.startedAt ?? Date.now(),
      }));
      router.push(`/game/${roomCode}`);
    });

    connection.on("RoomError", (message: string) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
      setRoomState((prev: any) => {
        if (!prev) {
          setTimeout(() => {
            alert(message);
            router.push("/menu");
          }, 0);
        }
        return prev;
      });
    });

    connection.on("KickedFromRoom", (message: string) => {
      alert(message);
      router.push("/menu");
    });

    if (connection.state === signalR.HubConnectionState.Disconnected) {
      connection.start()
        .then(() => { connection.invoke("JoinRoom", roomId); })
        .catch(err => console.log("SignalR Connection Info: ", err.toString()));
    } else if (connection.state === signalR.HubConnectionState.Connected) {
      connection.invoke("JoinRoom", roomId);
    }

    let unsubRequests: () => void = () => {};
    if (currentUserId) {
      const requestsRef = ref(realtimeDb, `friendRequests/${currentUserId}`);
      unsubRequests = onValue(requestsRef, (snap) => {
        setPendingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
      });
    }

    return () => {
      connection.off("RoomUpdated");
      connection.off("GameStarted");
      connection.off("LoadingPhaseStarted");
      connection.off("RoomError");
      connection.off("KickedFromRoom");
      unsubRequests();
    };
  }, [roomId, router]);

  const handleLeaveRoom = async () => {
    if (hubConnection) {
      await hubConnection.invoke("LeaveRoom");
      router.push("/menu");
    }
  };

  const handleToggleReady = async (isReady: boolean) => {
    if (hubConnection) await hubConnection.invoke("ToggleReady", isReady);
  };

  const handleStartGame = async () => {
    if (hubConnection) await hubConnection.invoke("StartGame");
  };

  const handleKickPlayer = async (targetUserId: string) => {
    if (hubConnection) await hubConnection.invoke("KickPlayer", targetUserId);
  };

  const handleUpdateSettings = async (newSettings: Partial<RoomSettings>) => {
    const merged = { ...localSettings, ...newSettings };
    setLocalSettings(merged);
    if (hubConnection) {
      try {
        await hubConnection.invoke("UpdateRoomSettings", merged);
      } catch (e) {
        // Bỏ qua nếu backend chưa có method này
      }
    }
  };

  const roomCode = Array.isArray(roomId) ? roomId[0] : String(roomId ?? "");
  const backgroundImage = useMemo(() => {
    const images = ["/bg1.jpg", "/bg2.jpg", "/bg3.jpg", "/bg4.png"];
    const hash = roomCode.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return images[hash % images.length];
  }, [roomCode]);

  if (!roomState) {
    return (
      <div style={{
        minHeight: "100vh", width: "100vw",
        backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.9), rgba(4,5,10,0.96)), url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            border: "3px solid rgba(230,168,34,0.15)",
            borderTopColor: "#e6a822",
            animation: "spin 1s linear infinite",
          }} />
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, letterSpacing: "0.1em" }}>
            Sẵn sàng...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const isHost = Boolean(roomState.hostId && roomState.hostId === userId);
  const players = Object.values(roomState.players || {}) as any[];
  const myPlayer = players.find(p => p.userId === userId);
  const isMyPlayerReady = myPlayer?.isReady ?? false;
  const allReady = players.length >= 3 && players.every(p => p.isReady);
  const canStart = isHost && allReady;
  const settings = roomState.settings || {};

  const roleCountBadges = [
    { label: "Dân thường", count: (settings.maxPlayers || 0) - (settings.maxBlackHats || 0) - (settings.maxWhiteHats || 0), color: "#22c55e", icon: "🏛️" },
    { label: "Nội gián", count: settings.maxBlackHats || 0, color: "#ef4444", icon: "🎭" },
    { label: "Mũ trắng", count: settings.maxWhiteHats || 0, color: "#a3a3a3", icon: "🤍" },
  ];

  return (
    <div style={{
      minHeight: "100vh", width: "100vw",
      backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.9) 0%, rgba(7,9,17,0.62) 44%, rgba(4,5,10,0.96) 100%), url(${backgroundImage})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      position: "relative", overflow: "hidden",
      padding: "24px 16px 100px",
    }}>
      {/* Background ambient glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(230,168,34,0.08) 0%, transparent 60%)",
      }} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", height: 300, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(99,102,241,0.06) 0%, transparent 70%)",
      }} />

      {/* Error toast */}
      {errorMsg && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(135deg, #7f1d1d, #991b1b)",
          color: "#fff", padding: "12px 24px", borderRadius: 12,
          border: "1px solid rgba(239,68,68,0.4)",
          boxShadow: "0 8px 32px rgba(239,68,68,0.3)",
          fontSize: 14, fontWeight: 700, zIndex: 1000,
          animation: "slideDown 0.3s ease",
        }}>
          ⚠️ {errorMsg}
          <style>{`@keyframes slideDown { from { opacity:0; transform: translateX(-50%) translateY(-12px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }`}</style>
        </div>
      )}

      {/* ====== HEADER ====== */}
      <div style={{ width: "100%", maxWidth: 900, marginBottom: 28, zIndex: 1 }}>
        <div style={{
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20, padding: "18px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          {/* Leave button */}
          <button
            onClick={handleLeaveRoom}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(239,68,68,0.08)", color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.2)",
              padding: "8px 16px", borderRadius: 10,
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              transition: "all 0.2s", letterSpacing: "0.04em",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.18)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.5)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)";
            }}
          >
            <LogOut size={15} /> Thoát
          </button>

          {/* Room ID */}
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, letterSpacing: "0.3em", margin: "0 0 4px", textTransform: "uppercase" }}>
              Mã phòng
            </p>
            <h1 style={{
              fontSize: 28, fontWeight: 900, color: "#e6a822",
              letterSpacing: "0.15em", margin: 0,
              textShadow: "0 0 30px rgba(230,168,34,0.4)",
            }}>
              {roomState.roomId}
            </h1>
          </div>

          {/* Player count */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            padding: "8px 16px", borderRadius: 10,
          }}>
            <Users size={15} style={{ color: "rgba(255,255,255,0.4)" }} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{players.length}</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>/ {settings.maxPlayers || "?"}</span>
          </div>
        </div>
      </div>

      {/* ====== ROLE BADGES ====== */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, zIndex: 1, flexWrap: "wrap", justifyContent: "center" }}>
        {roleCountBadges.map(badge => (
          <div key={badge.label} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: `${badge.color}10`,
            border: `1px solid ${badge.color}30`,
            borderRadius: 10, padding: "7px 14px",
          }}>
            <span style={{ fontSize: 16 }}>{badge.icon}</span>
            <span style={{ color: badge.color, fontWeight: 700, fontSize: 14 }}>{badge.count}</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{badge.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, width: "100%", maxWidth: 900, zIndex: 1, alignItems: "flex-start" }}>
        {/* ====== PLAYER GRID ====== */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
          }}>
            {/* Actual players */}
            {players.map((player: any) => {
              const isMe = player.userId === userId;
              const isPlayerHost = player.userId === roomState.hostId;
              return (
                <div
                  key={player.userId}
                  style={{
                    background: player.isReady
                      ? "linear-gradient(135deg, rgba(34,197,94,0.07) 0%, rgba(255,255,255,0.03) 100%)"
                      : "rgba(255,255,255,0.03)",
                    border: player.isReady
                      ? "1px solid rgba(34,197,94,0.25)"
                      : isMe
                        ? "1px solid rgba(230,168,34,0.3)"
                        : "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 18,
                    padding: "20px 16px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    position: "relative",
                    backdropFilter: "blur(10px)",
                    transition: "all 0.3s",
                    boxShadow: isMe
                      ? "0 0 20px rgba(230,168,34,0.08)"
                      : player.isReady
                        ? "0 0 20px rgba(34,197,94,0.06)"
                        : "none",
                  }}
                >
                  {/* Host crown */}
                  {isPlayerHost && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: "linear-gradient(135deg, #e6a822, #d4941a)",
                      color: "#000", padding: "3px 12px", borderRadius: 99,
                      fontSize: 10, fontWeight: 900, letterSpacing: "0.1em",
                      display: "flex", alignItems: "center", gap: 4,
                      boxShadow: "0 4px 12px rgba(230,168,34,0.4)",
                    }}>
                      <Crown size={10} /> CHỦ PHÒNG
                    </div>
                  )}

                  {/* Kick button (host only) */}
                  {isHost && !isMe && (
                    <button
                      onClick={() => handleKickPlayer(player.userId)}
                      style={{
                        position: "absolute", top: 10, right: 10,
                        background: "transparent", border: "none",
                        color: "rgba(239,68,68,0.4)", cursor: "pointer",
                        padding: 4, borderRadius: 6, transition: "all 0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(239,68,68,0.4)"}
                      title="Đuổi khỏi phòng"
                    >
                      <XCircle size={18} />
                    </button>
                  )}

                  {/* Avatar */}
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: isMe
                      ? "radial-gradient(circle at 35% 35%, rgba(230,168,34,0.3), #1a1a2e)"
                      : "radial-gradient(circle at 35% 35%, rgba(99,102,241,0.2), #1a1a2e)",
                    border: isMe
                      ? "2px solid rgba(230,168,34,0.5)"
                      : "2px solid rgba(99,102,241,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 900,
                    color: isMe ? "#e6a822" : "#6366f1",
                    marginTop: isPlayerHost ? 10 : 0,
                    boxShadow: isMe ? "0 0 16px rgba(230,168,34,0.2)" : "none",
                  }}>
                    {player.displayName?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  {/* Name */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      color: isMe ? "#e6a822" : "#fff",
                      fontWeight: 700, fontSize: 14,
                      maxWidth: 140, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {player.displayName}
                    </div>
                    {isMe && (
                      <div style={{ color: "rgba(230,168,34,0.6)", fontSize: 10, marginTop: 2, letterSpacing: "0.1em" }}>
                        (Bạn)
                      </div>
                    )}
                  </div>

                  {/* Ready status */}
                  {player.isReady ? (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(34,197,94,0.3)",
                      color: "#22c55e", padding: "4px 12px", borderRadius: 99,
                      fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                    }}>
                      <CheckCircle2 size={12} /> SẴN SÀNG
                    </div>
                  ) : (
                    <div style={{
                      color: "rgba(255,255,255,0.25)",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      padding: "4px 12px", borderRadius: 99,
                      fontSize: 11, fontWeight: 600,
                    }}>
                      Đang chờ...
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: (settings.maxPlayers || 0) - players.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{
                  background: "rgba(255,255,255,0.015)",
                  border: "1px dashed rgba(255,255,255,0.07)",
                  borderRadius: 18, padding: "20px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                  cursor: "pointer", transition: "all 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.05)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.015)"}
                onClick={() => setIsFriendOpen(true)}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "rgba(255,255,255,0.03)",
                  border: "2px dashed rgba(255,255,255,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Users size={24} style={{ color: "rgba(255,255,255,0.15)" }} />
                </div>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>Trống</span>
                <div style={{
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  color: "rgba(99,102,241,0.8)",
                  padding: "4px 12px", borderRadius: 99,
                  fontSize: 11, fontWeight: 700,
                }}>
                  + Mời bạn
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ====== SETTINGS PANEL (Host only) ====== */}
        {isHost && (
          <div style={{
            width: 260, flexShrink: 0,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18, overflow: "hidden",
            backdropFilter: "blur(12px)",
          }}>
            {/* Settings header */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                width: "100%", padding: "16px 20px",
                background: "transparent", border: "none",
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", color: "#fff",
                borderBottom: showSettings ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}
            >
              <Settings size={16} style={{ color: "#e6a822" }} />
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: "left" }}>Cài đặt phòng</span>
              {showSettings ? <ChevronUp size={16} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={16} style={{ color: "rgba(255,255,255,0.4)" }} />}
            </button>

            {showSettings && (
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Describe Duration */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Clock size={13} style={{ color: "#22c55e" }} />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Thời gian nói</span>
                    <span style={{ marginLeft: "auto", color: "#22c55e", fontWeight: 800, fontSize: 13 }}>{localSettings.describeDuration}s</span>
                  </div>
                  <input
                    type="range" min={15} max={60} step={5}
                    value={localSettings.describeDuration}
                    onChange={e => handleUpdateSettings({ describeDuration: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "#22c55e" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                    <span>15s</span><span>60s</span>
                  </div>
                </div>

                {/* Vote Duration */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Vote size={13} style={{ color: "#e6a822" }} />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Thời gian vote</span>
                    <span style={{ marginLeft: "auto", color: "#e6a822", fontWeight: 800, fontSize: 13 }}>{localSettings.voteDuration}s</span>
                  </div>
                  <input
                    type="range" min={30} max={90} step={15}
                    value={localSettings.voteDuration}
                    onChange={e => handleUpdateSettings({ voteDuration: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "#e6a822" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                    <span>30s</span><span>90s</span>
                  </div>
                </div>

                {/* Round Transition Duration */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Clock size={13} style={{ color: "#6366f1" }} />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Chờ giữa vòng</span>
                    <span style={{ marginLeft: "auto", color: "#6366f1", fontWeight: 800, fontSize: 13 }}>{localSettings.roundTransitionDuration}s</span>
                  </div>
                  <input
                    type="range" min={5} max={10} step={1}
                    value={localSettings.roundTransitionDuration}
                    onChange={e => handleUpdateSettings({ roundTransitionDuration: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "#6366f1" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                    <span>5s</span><span>10s</span>
                  </div>
                </div>

                {/* Reveal Eliminated Role */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: localSettings.revealEliminatedRole ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${localSettings.revealEliminatedRole ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                }}
                  onClick={() => handleUpdateSettings({ revealEliminatedRole: !localSettings.revealEliminatedRole })}
                >
                  {localSettings.revealEliminatedRole
                    ? <Eye size={15} style={{ color: "#22c55e" }} />
                    : <EyeOff size={15} style={{ color: "rgba(255,255,255,0.3)" }} />
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>Tiết lộ vai bị loại</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 2 }}>
                      {localSettings.revealEliminatedRole ? "Công khai sau vote" : "Ẩn đến cuối game"}
                    </div>
                  </div>
                  <div style={{
                    width: 36, height: 20, borderRadius: 99,
                    background: localSettings.revealEliminatedRole ? "#22c55e" : "rgba(255,255,255,0.1)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 2,
                      left: localSettings.revealEliminatedRole ? 18 : 2,
                      transition: "left 0.2s",
                    }} />
                  </div>
                </div>

                {/* Min player warning */}
                {players.length < 3 && (
                  <div style={{
                    padding: "10px 14px",
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: 10,
                    color: "#ef4444", fontSize: 11, fontWeight: 600,
                    lineHeight: 1.5,
                  }}>
                    ⚠️ Cần ít nhất 3 người chơi để bắt đầu.
                  </div>
                )}
                {players.length >= 3 && !allReady && (
                  <div style={{
                    padding: "10px 14px",
                    background: "rgba(230,168,34,0.07)",
                    border: "1px solid rgba(230,168,34,0.2)",
                    borderRadius: 10,
                    color: "#e6a822", fontSize: 11, fontWeight: 600,
                    lineHeight: 1.5,
                  }}>
                    ⏳ Chờ tất cả người chơi sẵn sàng.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== BOTTOM ACTIONS ====== */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "20px 24px",
        background: "linear-gradient(to top, rgba(10,10,20,0.98) 0%, rgba(10,10,20,0.8) 70%, transparent 100%)",
        display: "flex", justifyContent: "center", gap: 12,
        zIndex: 50,
      }}>
        {!isHost && (
          <button
            onClick={() => handleToggleReady(!isMyPlayerReady)}
            style={{
              padding: "14px 40px", borderRadius: 14,
              fontWeight: 900, fontSize: 15, cursor: "pointer",
              letterSpacing: "0.08em", border: "none",
              transition: "all 0.2s", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              background: isMyPlayerReady
                ? "rgba(255,255,255,0.07)"
                : "linear-gradient(135deg, #22c55e, #16a34a)",
              color: isMyPlayerReady ? "rgba(255,255,255,0.5)" : "#fff",
              borderTop: isMyPlayerReady ? "1px solid rgba(255,255,255,0.08)" : "none",
            }}
            onMouseEnter={e => !isMyPlayerReady && ((e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"}
          >
            {isMyPlayerReady ? "✖ HỦY SẴN SÀNG" : "✓ SẴN SÀNG"}
          </button>
        )}

        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            style={{
              padding: "14px 48px", borderRadius: 14,
              fontWeight: 900, fontSize: 15, cursor: canStart ? "pointer" : "not-allowed",
              letterSpacing: "0.08em", border: "none",
              transition: "all 0.2s",
              background: canStart
                ? "linear-gradient(135deg, #e6a822, #d4941a)"
                : "rgba(255,255,255,0.05)",
              color: canStart ? "#000" : "rgba(255,255,255,0.2)",
              boxShadow: canStart ? "0 8px 32px rgba(230,168,34,0.35)" : "none",
              display: "flex", alignItems: "center", gap: 10,
            }}
            onMouseEnter={e => canStart && ((e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"}
          >
            <Play size={18} fill="currentColor" />
            BẮT ĐẦU GAME
          </button>
        )}
      </div>

      {/* Friend Modal */}
      {token && (
        <FriendModal
          isOpen={isFriendOpen}
          onClose={() => setIsFriendOpen(false)}
          token={token}
          pendingCount={pendingCount}
        />
      )}
    </div>
  );
}
