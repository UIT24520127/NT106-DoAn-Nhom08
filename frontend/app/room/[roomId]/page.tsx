"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { Users, LogOut, Play, Shield, ShieldAlert, Crown, CheckCircle2 } from "lucide-react";

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    const currentUserId = localStorage.getItem("userId") || "";
    setUserId(currentUserId);

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("https://localhost:7210/gamehub", {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .build();

    setHubConnection(connection);

    connection.on("RoomUpdated", (room: any) => {
      setRoomState(room);
    });

    connection.on("GameStarted", (room: any) => {
      router.push(`/game/${room.roomId}`);
    });

    connection.on("RoomError", (message: string) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
    });

    connection.start()
      .then(() => {
        connection.invoke("GetRoomState", roomId);
      })
      .catch(err => console.error("SignalR Connection Error: ", err));

    return () => {
      connection.stop();
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

  return (
    <div className="relative h-screen w-screen bg-[url('/bg.png')] bg-cover bg-center overflow-hidden flex flex-col items-center pt-20">
      {errorMsg && (
        <div className="absolute top-10 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-bold animate-fade-in z-50">
          {errorMsg}
        </div>
      )}

      {/* HEADER */}
      <div className="bg-[#1a1c23]/90 backdrop-blur-md p-6 rounded-3xl border border-gray-700 shadow-2xl w-full max-w-4xl text-center mb-8 relative">
        <button
          onClick={handleLeaveRoom}
          className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl transition font-bold"
        >
          <LogOut size={18} /> Thoát
        </button>
        <h1 className="text-4xl font-black text-[#e6a822] uppercase tracking-wider">PHÒNG {roomState.roomId}</h1>
        <p className="text-gray-300 font-medium mt-2">
          Số lượng: <span className="text-white font-bold">{players.length}/{roomState.settings.maxPlayers}</span> |
          Nội gián: <span className="text-red-400 font-bold">{roomState.settings.maxBlackHats}</span> |
          Kẻ ngốc: <span className="text-gray-100 font-bold">{roomState.settings.maxWhiteHats}</span>
        </p>
      </div>

      {/* PLAYERS GRID */}
      <div className="w-full max-w-4xl grid grid-cols-3 gap-6">
        {/* Render actual players */}
        {players.map((player: any) => (
          <div key={player.userId} className="bg-[#1a1c23]/80 backdrop-blur-md p-6 rounded-3xl border border-gray-700 flex flex-col items-center gap-4 relative">
            {player.userId === roomState.hostId && (
              <div className="absolute -top-4 bg-yellow-500 text-black px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 shadow-lg">
                <Crown size={14} /> CHỦ PHÒNG
              </div>
            )}

            <div className="w-24 h-24 bg-gray-800 rounded-full border-4 border-gray-600 flex items-center justify-center shadow-inner overflow-hidden">
              <Users size={40} className="text-gray-500" />
            </div>

            <h3 className="text-white font-bold text-lg">{player.displayName}</h3>

            {player.isReady ? (
              <span className="flex items-center gap-1 text-green-400 font-bold bg-green-400/10 px-3 py-1 rounded-full text-sm">
                <CheckCircle2 size={16} /> ĐÃ SẴN SÀNG
              </span>
            ) : (
              <span className="text-gray-500 font-medium bg-gray-800 px-3 py-1 rounded-full text-sm">
                Đang chờ...
              </span>
            )}
          </div>
        ))}

        {/* Render empty slots */}
        {Array.from({ length: roomState.settings.maxPlayers - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-[#1a1c23]/40 backdrop-blur-sm p-6 rounded-3xl border border-dashed border-gray-700 flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 bg-gray-800/50 rounded-full flex items-center justify-center">
              <Users size={30} className="text-gray-600" />
            </div>
            <span className="text-gray-500 font-medium">Trống</span>
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

    </div>
  );
}
