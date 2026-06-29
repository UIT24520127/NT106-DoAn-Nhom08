"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { Users, LogOut, Play, Crown, CheckCircle2, XCircle, Settings, Clock, Vote, Eye, EyeOff, ChevronUp, ChevronDown, Copy } from "lucide-react";
import { getSignalRConnection } from "@/lib/signalRConnection";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import FriendModal from "@/components/friends/FriendModal";
import SettingsModal from "@/components/SettingsModal";
import { useGameSound } from "@/hooks/useGameSound";
import axios from "axios";
import { API_URL } from "@/lib/auth";

interface RoomSettings {
  maxPlayers: number;
  maxBlackHats: number;
  maxWhiteHats: number;
  describeDuration: number;
  voteDuration: number;
  revealEliminatedRole: boolean;
  roundTransitionDuration: number;
}

function RoomPageContent() {
  const { playClick, playReady, playStart, playAlert, playBGM } = useGameSound();
  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId');
  const router = useRouter();
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isFriendOpen, setIsFriendOpen] = useState(false);
  const [token, setToken] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<RoomSettings>>({
    describeDuration: 30,
    voteDuration: 60,
    revealEliminatedRole: true,
    roundTransitionDuration: 5,
  });
  const [popup, setPopup] = useState({ isOpen: false, title: "", message: "", redirectOnClose: false });
  const [hasUnread, setHasUnread] = useState(false);

  // Phát nhạc chờ khi vào phòng
  useEffect(() => {
    playBGM();
  }, [playBGM]);

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
      router.push(`/game?roomId=${room.roomId}`);
    });

    connection.on("LoadingPhaseStarted", (data: { timeoutSeconds?: number; totalCount?: number; startedAt?: number }) => {
      const roomCode = Array.isArray(roomId) ? roomId[0] : String(roomId ?? "");
      sessionStorage.setItem(`loading:${roomCode}`, JSON.stringify({
        timeoutSeconds: data.timeoutSeconds ?? 10,
        totalCount: data.totalCount ?? 0,
        startedAt: data.startedAt ?? Date.now(),
      }));
      router.push(`/game?roomId=${roomCode}`);
    });

    connection.on("RoomError", (message: string) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
      setRoomState((prev: any) => {
        if (!prev) {
          setPopup({ isOpen: true, title: "Lỗi Phòng", message, redirectOnClose: true });
        }
        return prev;
      });
    });

    connection.on("KickedFromRoom", (message: string) => {
      setPopup({ isOpen: true, title: "Đã Bị Kích", message, redirectOnClose: true });
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

      // ÉP BACKEND ĐỒNG BỘ: Gọi ngầm API 1 lần duy nhất khi vào Phòng
      const storedToken = sessionStorage.getItem("token");
      if (storedToken) {
        axios.get(`${API_URL}/api/friends`, { headers: { Authorization: `Bearer ${storedToken}` } }).catch(() => {});
        axios.get(`${API_URL}/api/friends/requests/pending`, { headers: { Authorization: `Bearer ${storedToken}` } }).catch(() => {});
      }
    }

    return () => {
      connection.off("RoomUpdated");
      connection.off("GameStarted");
      connection.off("LoadingPhaseStarted");
      connection.off("RoomError");
      connection.off("KickedFromRoom");
      unsubRequests();
    };
  }, [roomId, router, playStart]);

  const handleLeaveRoom = async () => {
    playClick();
    if (hubConnection) {
      await hubConnection.invoke("LeaveRoom");
      router.push("/menu");
    }
  };

  const handleToggleReady = async (isReady: boolean) => {
    playReady();
    if (hubConnection) await hubConnection.invoke("ToggleReady", isReady);
  };

  const handleStartGame = async () => {
    playClick();
    if (hubConnection) await hubConnection.invoke("StartGame");
  };

  const handleCopyId = () => {
    playClick();
    navigator.clipboard.writeText(roomState.roomId);
    setErrorMsg("Đã copy mã phòng!");
    setTimeout(() => setErrorMsg(""), 2000);
  };

  const handleKickPlayer = async (targetUserId: string) => {
    playClick();
    if (hubConnection) await hubConnection.invoke("KickPlayer", targetUserId);
  };

  const handleUpdateSettings = async (newSettings: Partial<RoomSettings>) => {
    playClick();
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
    const images = ["/bg1.jpg", "/bg2.jpg", "/bg3.jpg", "/bg4.jpg"];
    const hash = roomCode.split("").reduce((sum: number, char: string) => sum + char.charCodeAt(0), 0);
    return images[hash % images.length];
  }, [roomCode]);

  if (!roomState) {
    return (
      <div className="h-screen w-screen bg-[#1a1c23] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 border-4 border-[#3b82f6]/20 border-t-[#e6a822] rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm tracking-widest uppercase">Sẵn sàng...</p>
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

  const maxPlayers = settings.maxPlayers || 8;
  
  let gridColsClass = "grid-cols-3";
  let cardPaddingClass = "p-6";
  let avatarSizeClass = "w-24 h-24";
  let iconSize = 40;
  let titleSizeClass = "text-lg";
  let crownSize = 14;
  let readyBadgeClass = "px-3 py-1 text-sm";
  let checkIconSize = 16;
  let cardGapClass = "gap-4";
  let topOffsetClass = "-top-4";

  if (maxPlayers > 6 && maxPlayers <= 10) {
    gridColsClass = "grid-cols-4";
    cardPaddingClass = "p-4";
    avatarSizeClass = "w-16 h-16";
    iconSize = 30;
    titleSizeClass = "text-base";
    crownSize = 12;
    readyBadgeClass = "px-2.5 py-0.5 text-xs";
    checkIconSize = 12;
    cardGapClass = "gap-3";
    topOffsetClass = "-top-3.5";
  } else if (maxPlayers > 10) {
    gridColsClass = "grid-cols-5";
    cardPaddingClass = "p-3";
    avatarSizeClass = "w-12 h-12";
    iconSize = 24;
    titleSizeClass = "text-sm";
    crownSize = 10;
    readyBadgeClass = "px-2 py-0.5 text-[10px]";
    checkIconSize = 10;
    cardGapClass = "gap-2";
    topOffsetClass = "-top-3";
  }

  return (
    <div 
      className="relative min-h-screen w-screen bg-cover bg-center overflow-x-hidden overflow-y-auto flex flex-col items-center pt-20 pb-28 custom-scrollbar"
      style={{ backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.9) 0%, rgba(7,9,17,0.62) 44%, rgba(4,5,10,0.96) 100%), url(${backgroundImage})` }}
    >
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(230,168,34,0.08)_0%,transparent_60%)]" />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] pointer-events-none bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,rgba(99,102,241,0.06)_0%,transparent_70%)]" />

      {errorMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-gradient-to-br from-red-900 to-red-800 text-white px-6 py-3 rounded-xl border border-red-500/40 shadow-[0_8px_32px_rgba(239,68,68,0.3)] font-bold text-sm z-[1000]">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 relative z-10">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 px-4 py-2 rounded-xl transition-all font-bold text-sm tracking-wide"
        >
          <LogOut size={16} /> Thoát
        </button>
        
        <div className="text-center group cursor-pointer" onClick={handleCopyId}>
          <p className="text-white/40 text-[10px] tracking-[0.3em] uppercase mb-1">Mã phòng <Copy size={10} className="inline ml-1" /></p>
          <h1 className="text-3xl font-black text-[#e6a822] uppercase tracking-widest drop-shadow-[0_0_30px_rgba(230,168,34,0.4)] m-0 leading-none">
            {roomState.roomId}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
            <Users size={16} className="text-white/40" />
            <span className="text-white font-bold text-base">{players.length}</span>
            <span className="text-white/30 text-sm">/ {settings.maxPlayers || "?"}</span>
          </div>

          <button
            onClick={() => { playClick(); setShowSoundSettings(true); }}
            title="Cài đặt âm thanh"
            className="flex items-center justify-center w-10 h-10 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30 rounded-xl transition-all text-white/70 hover:text-white"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={() => { playClick(); setIsFriendOpen(true); }}
            className="flex items-center gap-2 bg-[#e6a822] text-black hover:scale-105 hover:bg-yellow-400 px-4 py-2 rounded-xl transition-all font-black text-sm relative shadow-lg shadow-yellow-500/10"
          >
            <Users size={16} /> MỜI BẠN BÈ
            {(pendingCount > 0 || hasUnread) && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1a1c23]" />
            )}
          </button>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl z-10 items-start px-4 sm:px-0">
        
        <div className="flex-1 w-full">
          <div className={`grid ${gridColsClass} gap-3.5 pt-5 pb-2 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar`}>
            {players.map((player: any) => {
              const isMe = player.userId === userId;
              const isPlayerHost = player.userId === roomState.hostId;
              return (
                <div key={player.userId} 
                  className={`backdrop-blur-md rounded-2xl ${cardPaddingClass} flex flex-col items-center ${cardGapClass} relative transition-all duration-300 ${
                    player.isReady 
                      ? "bg-gradient-to-br from-green-500/10 to-white/5 border border-green-500/25 shadow-[0_0_20px_rgba(34,197,94,0.06)]"
                      : isMe 
                        ? "bg-white/5 border border-[#e6a822]/30 shadow-[0_0_20px_rgba(230,168,34,0.08)]"
                        : "bg-white/5 border border-white/10"
                  }`}
                >
                  {isPlayerHost && (
                    <div className={`absolute ${topOffsetClass} left-1/2 -translate-x-1/2 bg-gradient-to-br from-[#e6a822] to-[#d4941a] text-black px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-[0_4px_12px_rgba(230,168,34,0.4)] tracking-widest`}>
                      <Crown size={crownSize} /> CHỦ PHÒNG
                    </div>
                  )}

                  {isHost && !isMe && (
                    <button 
                      onClick={() => handleKickPlayer(player.userId)}
                      className="absolute top-2 right-2 text-red-500/40 hover:text-red-500 hover:scale-110 active:scale-95 transition-all"
                      title="Đuổi khỏi phòng"
                    >
                      <XCircle size={18} />
                    </button>
                  )}

                  <div className={`${avatarSizeClass} rounded-full flex items-center justify-center font-black text-2xl overflow-hidden shadow-inner ${
                    isMe 
                      ? "bg-[radial-gradient(circle_at_35%_35%,rgba(230,168,34,0.3),#1a1a2e)] border-2 border-[#e6a822]/50 text-[#e6a822] shadow-[0_0_16px_rgba(230,168,34,0.2)]"
                      : "bg-[radial-gradient(circle_at_35%_35%,rgba(99,102,241,0.2),#1a1a2e)] border-2 border-indigo-500/30 text-indigo-500"
                  } ${isPlayerHost ? 'mt-2' : ''}`}>
                    {player.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar} alt={player.displayName} className="w-full h-full object-cover" />
                    ) : (
                      player.displayName?.charAt(0)?.toUpperCase() || "?"
                    )}
                  </div>

                  <div className="text-center w-full">
                    <h3 className={`${isMe ? 'text-[#e6a822]' : 'text-white'} font-bold ${titleSizeClass} truncate px-1 w-full`}>
                      {player.displayName}
                    </h3>
                    {isMe && <p className="text-[#e6a822]/60 text-[10px] mt-0.5 tracking-widest uppercase">(Bạn)</p>}
                  </div>

                  {player.isReady ? (
                    <span className={`flex items-center gap-1.5 text-green-500 font-extrabold bg-green-500/10 border border-green-500/30 ${readyBadgeClass} rounded-full tracking-wider`}>
                      <CheckCircle2 size={checkIconSize} /> SẴN SÀNG
                    </span>
                  ) : (
                    <span className={`text-white/30 font-semibold bg-white/5 border border-white/10 ${readyBadgeClass} rounded-full`}>
                      Đang chờ...
                    </span>
                  )}
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, (settings.maxPlayers || 0) - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} 
                className={`bg-white/5 border border-dashed border-white/10 hover:bg-indigo-500/5 ${cardPaddingClass} rounded-2xl flex flex-col items-center cursor-pointer transition-all ${cardGapClass}`}
                onClick={() => { playClick(); setIsFriendOpen(true); }}
              >
                <div className={`${avatarSizeClass} bg-white/5 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center`}>
                  <Users size={iconSize/1.5} className="text-white/15" />
                </div>
                <span className="text-white/20 text-xs font-medium">Trống</span>
                <div className="bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 px-3 py-1 rounded-full text-[11px] font-bold">
                  + Mời bạn
                </div>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className="w-full lg:w-[280px] shrink-0 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col h-fit">
            <button
              onClick={() => { playClick(); setShowSettings(!showSettings); }}
              className={`w-full px-5 py-4 bg-transparent border-none flex items-center gap-3 cursor-pointer text-white transition-all hover:bg-white/5 ${showSettings ? 'border-b border-white/10' : ''}`}
            >
              <Settings size={18} className="text-[#e6a822]" />
              <span className="font-bold text-sm flex-1 text-left uppercase tracking-wider">Cài đặt phòng</span>
              {showSettings ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
            </button>

            {showSettings && (
              <div className="p-5 flex flex-col gap-5">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                      <Clock size={14} className="text-green-500" /> Thời gian nói
                    </div>
                    <span className="text-green-500 font-black text-sm">{localSettings.describeDuration}s</span>
                  </div>
                  <input
                    type="range" min={15} max={60} step={5}
                    value={localSettings.describeDuration}
                    onChange={e => handleUpdateSettings({ describeDuration: Number(e.target.value) })}
                    className="w-full accent-green-500"
                  />
                  <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                    <span>15s</span><span>60s</span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                      <Vote size={14} className="text-[#e6a822]" /> Thời gian vote
                    </div>
                    <span className="text-[#e6a822] font-black text-sm">{localSettings.voteDuration}s</span>
                  </div>
                  <input
                    type="range" min={30} max={90} step={15}
                    value={localSettings.voteDuration}
                    onChange={e => handleUpdateSettings({ voteDuration: Number(e.target.value) })}
                    className="w-full accent-[#e6a822]"
                  />
                  <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                    <span>30s</span><span>90s</span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                      <Clock size={14} className="text-indigo-500" /> Chờ giữa vòng
                    </div>
                    <span className="text-indigo-500 font-black text-sm">{localSettings.roundTransitionDuration}s</span>
                  </div>
                  <input
                    type="range" min={5} max={10} step={1}
                    value={localSettings.roundTransitionDuration}
                    onChange={e => handleUpdateSettings({ roundTransitionDuration: Number(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                    <span>5s</span><span>10s</span>
                  </div>
                </div>

                <div 
                  onClick={() => handleUpdateSettings({ revealEliminatedRole: !localSettings.revealEliminatedRole })}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                    localSettings.revealEliminatedRole 
                      ? 'bg-green-500/10 border-green-500/20' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {localSettings.revealEliminatedRole ? <Eye size={18} className="text-green-500"/> : <EyeOff size={18} className="text-white/30"/>}
                  <div className="flex-1">
                    <div className="text-white text-xs font-bold">Tiết lộ vai</div>
                    <div className="text-white/30 text-[10px] mt-0.5">
                      {localSettings.revealEliminatedRole ? "Công khai" : "Ẩn thân"}
                    </div>
                  </div>
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${localSettings.revealEliminatedRole ? 'bg-green-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${localSettings.revealEliminatedRole ? 'left-[18px]' : 'left-0.5'}`} />
                  </div>
                </div>

                {players.length < 3 && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold leading-relaxed">
                    ⚠️ Cần ít nhất 3 người chơi để bắt đầu.
                  </div>
                )}
                {players.length >= 3 && !allReady && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-[#e6a822] text-xs font-bold leading-relaxed">
                    ⏳ Chờ tất cả người chơi sẵn sàng.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 px-6 py-5 bg-gradient-to-t from-[#0a0a14] via-[#0a0a14]/90 to-transparent flex justify-center gap-4 z-50 pointer-events-none">
        <div className="pointer-events-auto flex gap-4">
          {!isHost && (
            <button
              onClick={() => handleToggleReady(!isMyPlayerReady)}
              className={`px-10 py-3.5 rounded-2xl font-black text-sm md:text-base cursor-pointer tracking-wider border-none transition-all shadow-[0_8px_24px_rgba(0,0,0,0.4)] ${
                isMyPlayerReady
                  ? 'bg-white/10 text-white/50 border-t border-white/10'
                  : 'bg-gradient-to-br from-green-500 to-green-600 text-white hover:-translate-y-0.5'
              }`}
            >
              {isMyPlayerReady ? "✖ HỦY SẴN SÀNG" : "✓ SẴN SÀNG"}
            </button>
          )}

          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={!canStart}
              className={`px-12 py-3.5 rounded-2xl font-black text-sm md:text-base tracking-wider border-none transition-all flex items-center gap-2.5 ${
                canStart
                  ? 'bg-gradient-to-br from-[#e6a822] to-[#d4941a] text-black shadow-[0_8px_32px_rgba(230,168,34,0.35)] hover:-translate-y-0.5 cursor-pointer'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              <Play size={18} fill="currentColor" /> BẮT ĐẦU GAME
            </button>
          )}
        </div>
      </div>

      {token && (
        <FriendModal
          isOpen={isFriendOpen}
          onClose={() => setIsFriendOpen(false)}
          token={token}
          pendingCount={pendingCount}
          showInvite={true}
        />
      )}

      {showSoundSettings && <SettingsModal onClose={() => setShowSoundSettings(false)} />}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#fcf8e8] w-full max-w-sm rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-2 border-[#d3b88b] p-6 text-center">
            <h2 className="text-2xl font-black mb-2 text-red-700">{popup.title}</h2>
            <p className="text-[#3e2723] font-medium text-base mb-6">{popup.message}</p>
            <button
              onClick={() => {
                playClick();
                setPopup({ ...popup, isOpen: false });
                if (popup.redirectOnClose) router.push('/menu');
              }}
              className="w-full bg-[#3e2723] hover:bg-black text-white font-bold py-2.5 rounded transition-all shadow-[0_1px_3px_rgba(0,0,0,0.1)] active:scale-95"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen bg-[#1a1c23] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 border-4 border-[#3b82f6]/20 border-t-[#e6a822] rounded-full animate-spin"></div>
        <p className="text-gray-400 text-sm tracking-widest uppercase">Đang tải phòng...</p>
      </div>
    }>
      <RoomPageContent />
    </Suspense>
  );
}
