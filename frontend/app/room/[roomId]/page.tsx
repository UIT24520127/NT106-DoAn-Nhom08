"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { Users, LogOut, Play, Shield, ShieldAlert, Crown, CheckCircle2, XCircle } from "lucide-react";
import { getSignalRConnection } from "@/lib/signalRConnection";
import { ref, onValue } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import FriendModal from "@/components/friends/FriendModal";

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
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("token") || "";
    const currentUserId = localStorage.getItem("userId") || "";
    setUserId(currentUserId);
    setToken(storedToken);

    const connection = getSignalRConnection(storedToken);
    setHubConnection(connection);

    // Xóa listener cũ
    connection.off("RoomUpdated");
    connection.off("GameStarted");
    connection.off("RoomError");
    connection.off("KickedFromRoom");

    connection.on("RoomUpdated", (room: any) => {
      setRoomState(room);
    });

    connection.on("GameStarted", (room: any) => {
      router.push(`/game/${room.roomId}`);
    });

    connection.on("RoomError", (message: string) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
      
      // Nếu có lỗi ngay từ lúc join (roomState chưa có) thì kick ra ngoài
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
        .then(() => {
          connection.invoke("JoinRoom", roomId);
        })
        .catch(err => console.log("SignalR Connection Info: ", err.toString()));
    } else if (connection.state === signalR.HubConnectionState.Connected) {
      connection.invoke("JoinRoom", roomId);
    }

    let unsubRequests: () => void = () => {};
    let unsubUnread: () => void = () => {};
    if (currentUserId) {
      const requestsRef = ref(realtimeDb, `friendRequests/${currentUserId}`);
      unsubRequests = onValue(requestsRef, (snap) => {
        setPendingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
      });

      const unreadRef = ref(realtimeDb, `unread_messages/${currentUserId}`);
      unsubUnread = onValue(unreadRef, (snap) => {
        setHasUnread(snap.exists());
      });
    }

    return () => {
      // Không stop kết nối
      connection.off("RoomUpdated");
      connection.off("GameStarted");
      connection.off("RoomError");
      connection.off("KickedFromRoom");
      unsubRequests();
      unsubUnread();
    };
  }, [roomId, router]);

  const handleLeaveRoom = async () => {
    if (hubConnection) {
      await hubConnection.invoke("LeaveRoom");
      router.push("/menu");
    }
  };

  const handleToggleReady = async (isReady: boolean) => {
    if (hubConnection) {
      await hubConnection.invoke("ToggleReady", isReady);
    }
  };

  const handleStartGame = async () => {
    if (hubConnection) {
      await hubConnection.invoke("StartGame");
    }
  };

  const handleKickPlayer = async (targetUserId: string) => {
    if (hubConnection) {
      await hubConnection.invoke("KickPlayer", targetUserId);
    }
  };

  if (!roomState) {
    return (
      <div className="h-screen w-screen bg-[#1a1c23] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-[#3b82f6]/20 border-t-[#e6a822] rounded-full animate-spin"></div>
      </div>
    );
  }

  const isHost = roomState.hostId === userId;
  const players = Object.values(roomState.players || {}) as any[];
  const myPlayer = players.find(p => p.userId === userId);
  const isMyPlayerReady = myPlayer?.isReady ?? false;
  const allReady = players.every(p => p.isReady);
  const canStart = isHost && players.length >= 3 && allReady;

  const maxPlayers = roomState.settings.maxPlayers;
  
  // Xây dựng các lớp CSS và kích thước động theo số lượng người chơi tối đa
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
    <div className="relative h-screen w-screen bg-[url('/bg.png')] bg-cover bg-center overflow-hidden flex flex-col items-center pt-20">
      {errorMsg && (
        <div className="absolute top-10 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-bold animate-fade-in z-50">
          {errorMsg}
        </div>
      )}

      {/* HEADER - Tái thiết kế responsive và nút bạn bè */}
      <div className="bg-[#1a1c23]/90 backdrop-blur-md p-6 rounded-3xl border border-gray-700 shadow-2xl w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 relative px-8">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl transition font-bold"
        >
          <LogOut size={18} /> Thoát
        </button>
        
        <div>
          <h1 className="text-3xl font-black text-[#e6a822] uppercase tracking-wider">PHÒNG {roomState.roomId}</h1>
          <p className="text-gray-300 font-semibold mt-1 text-sm">
            Số lượng: <span className="text-white font-bold">{players.length}/{roomState.settings.maxPlayers}</span> |
            Nội gián: <span className="text-red-400 font-bold">{roomState.settings.maxBlackHats}</span> |
            Kẻ ngốc: <span className="text-gray-100 font-bold">{roomState.settings.maxWhiteHats}</span>
          </p>
        </div>

        <button
          onClick={() => setIsFriendOpen(true)}
          className="flex items-center gap-2 bg-[#e6a822] text-black hover:bg-yellow-400 px-5 py-2.5 rounded-xl transition font-black relative shadow-lg shadow-yellow-500/10 active:scale-95"
        >
          <Users size={18} /> MỜI BẠN BÈ
          {(pendingCount > 0 || hasUnread) && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-gray-900 animate-pulse shadow-[0_0_8px_#ef4444]" />
          )}
        </button>
      </div>

      {/* PLAYERS GRID WITH SCROLLABLE WRAPPER TO PREVENT SCREEN OVERFLOW */}
      <div className={`w-full max-w-4xl grid ${gridColsClass} gap-4 max-h-[52vh] overflow-y-auto pr-2 custom-scrollbar`}>
        {/* Render actual players */}
        {players.map((player: any) => (
          <div key={player.userId} className={`bg-[#1a1c23]/80 backdrop-blur-md ${cardPaddingClass} rounded-3xl border border-gray-700 flex flex-col items-center ${cardGapClass} relative`}>
            {player.userId === roomState.hostId && (
              <div className={`absolute ${topOffsetClass} bg-yellow-500 text-black px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg`}>
                <Crown size={crownSize} /> CHỦ PHÒNG
              </div>
            )}

            {isHost && player.userId !== userId && (
              <button 
                onClick={() => handleKickPlayer(player.userId)}
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 hover:scale-110 active:scale-95 transition-all"
                title="Đuổi khỏi phòng"
              >
                <XCircle size={18} />
              </button>
            )}

            <div className={`${avatarSizeClass} bg-gray-800 rounded-full border-2 border-gray-600 flex items-center justify-center shadow-inner overflow-hidden mt-2`}>
              {player.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={player.avatar} alt={player.displayName} className="w-full h-full object-cover" />
              ) : (
                <Users size={iconSize} className="text-gray-500" />
              )}
            </div>

            <h3 className={`text-white font-bold ${titleSizeClass} text-center truncate w-full px-1`}>{player.displayName}</h3>

            {player.isReady ? (
              <span className={`flex items-center gap-1 text-green-400 font-bold bg-green-400/10 ${readyBadgeClass} rounded-full`}>
                <CheckCircle2 size={checkIconSize} /> ĐÃ SẴN SÀNG
              </span>
            ) : (
              <span className={`text-gray-500 font-medium bg-gray-800 ${readyBadgeClass} rounded-full`}>
                Đang chờ...
              </span>
            )}
          </div>
        ))}

        {/* Render empty slots */}
        {Array.from({ length: roomState.settings.maxPlayers - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className={`bg-[#1a1c23]/40 backdrop-blur-sm ${cardPaddingClass} rounded-3xl border border-dashed border-gray-700 flex flex-col items-center justify-center ${cardGapClass}`}>
            <div className={`${avatarSizeClass} bg-gray-800/50 rounded-full flex items-center justify-center mt-2`}>
              <Users size={iconSize} className="text-gray-600" />
            </div>
            <span className="text-gray-500 font-medium text-xs">Trống</span>
            <button 
              onClick={() => setIsFriendOpen(true)}
              className="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white px-3 py-1 rounded-full text-[10px] font-bold transition-all border border-indigo-600/50"
            >
              + Mời bạn
            </button>
          </div>
        ))}
      </div>

      {/* BOTTOM ACTION */}
      <div className="mt-auto mb-10 flex gap-4">
        {!isHost && (
          <button
            onClick={() => handleToggleReady(!isMyPlayerReady)}
            className={`px-12 py-4 rounded-2xl font-black text-xl transition-all shadow-xl active:scale-95 ${isMyPlayerReady
                ? 'bg-gray-600 text-white border-b-4 border-gray-800'
                : 'bg-green-500 text-white border-b-4 border-green-700 hover:bg-green-400'
              }`}
          >
            {isMyPlayerReady ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG'}
          </button>
        )}

        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={`px-16 py-4 rounded-2xl font-black text-xl transition-all shadow-xl flex items-center gap-3 ${canStart
                ? 'bg-[#e6a822] text-black border-b-4 border-yellow-700 hover:bg-yellow-400 active:scale-95'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
          >
            <Play size={24} fill="currentColor" /> BẮT ĐẦU GAME
          </button>
        )}
      </div>

      {/* FRIEND MODAL */}
      {token && (
        <FriendModal
          isOpen={isFriendOpen}
          onClose={() => setIsFriendOpen(false)}
          token={token}
          pendingCount={pendingCount}
          showInvite={true}
        />
      )}

    </div>
  );
}
