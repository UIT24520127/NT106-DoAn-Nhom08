"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { Users, Lock, Unlock, Search, PlusCircle, ArrowLeft } from "lucide-react";

interface RoomSummary {
  roomId: string;
  hostId: string;
  playerCount: number;
  maxPlayers: number;
  maxBlackHats: number;
  maxWhiteHats: number;
}

export default function PlayWithFriends() {
  const router = useRouter();
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  
  // Form State
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [maxBlackHats, setMaxBlackHats] = useState(1);
  const [maxWhiteHats, setMaxWhiteHats] = useState(1);
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    
    const connection = new signalR.HubConnectionBuilder()
      .withUrl("https://localhost:7210/gamehub", {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .build();

    setHubConnection(connection);

    connection.on("PublicRoomsList", (rooms: RoomSummary[]) => {
      setPublicRooms(rooms);
    });

    connection.on("RoomCreated", (room: any) => {
      setIsLoading(false);
      router.push(`/room/${room.roomId}`);
    });

    connection.on("RoomJoined", (room: any) => {
      setIsLoading(false);
      router.push(`/room/${room.roomId}`);
    });

    connection.on("RoomError", (message: string) => {
      setIsLoading(false);
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(""), 3000);
    });

    connection.start()
      .then(() => {
        connection.invoke("GetPublicRooms");
      })
      .catch(err => console.error("SignalR Connection Error: ", err));

    return () => {
      connection.stop();
    };
  }, [router]);

  const handleCreateRoom = async () => {
    if (!hubConnection) return;
    
    if (maxBlackHats + maxWhiteHats >= maxPlayers) {
      setErrorMsg("Tổng số Mũ đen và Mũ trắng phải nhỏ hơn Số người chơi ít nhất 1!");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    setIsLoading(true);
    try {
      await hubConnection.invoke("CreateRoom", maxPlayers, maxBlackHats, maxWhiteHats, isPublic);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubConnection || !joinCode.trim()) return;
    
    setIsLoading(true);
    try {
      await hubConnection.invoke("JoinRoom", joinCode.trim().toUpperCase());
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const handleJoinPublicRoom = async (roomId: string) => {
    if (!hubConnection) return;
    setIsLoading(true);
    try {
      await hubConnection.invoke("JoinRoom", roomId);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-screen bg-[#1a1c23] overflow-hidden flex flex-col">
      {/* HEADER */}
      <div className="flex items-center justify-between p-6 bg-[#252836] border-b border-gray-800 shadow-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/menu')}
            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
          >
            <ArrowLeft className="text-white" />
          </button>
          <h1 className="text-3xl font-black text-white tracking-wider">CHƠI VỚI BẠN</h1>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANE: PUBLIC ROOMS */}
        <div className="flex-1 border-r border-gray-800 p-6 flex flex-col bg-[#1f212a] overflow-hidden">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Search className="text-[#3b82f6]" />
            Sảnh chờ công khai
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {publicRooms.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">
                <p>Hiện không có phòng công khai nào.</p>
                <p>Hãy tạo phòng mới!</p>
              </div>
            ) : (
              publicRooms.map(room => (
                <div key={room.roomId} className="bg-[#2d303e] rounded-xl p-5 flex items-center justify-between border border-gray-700 hover:border-[#3b82f6] transition">
                  <div>
                    <h3 className="text-xl font-bold text-white">Phòng: {room.roomId}</h3>
                    <div className="flex items-center gap-4 mt-2 text-gray-400 text-sm">
                      <span className="flex items-center gap-1">
                        <Users size={16} />
                        {room.playerCount} / {room.maxPlayers}
                      </span>
                      <span>Mũ đen: {room.maxBlackHats}</span>
                      <span>Mũ trắng: {room.maxWhiteHats}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleJoinPublicRoom(room.roomId)}
                    disabled={room.playerCount >= room.maxPlayers || isLoading}
                    className="bg-[#3b82f6] hover:bg-blue-600 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-bold transition shadow-lg"
                  >
                    Tham gia
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANE: CREATE & JOIN PRIVATE */}
        <div className="w-[400px] p-6 bg-[#252836] flex flex-col gap-8 overflow-y-auto">
          
          {/* JOIN BY CODE */}
          <div className="bg-[#1f212a] p-5 rounded-2xl border border-gray-700 shadow-md">
            <h3 className="text-lg font-bold text-white mb-4">Tham gia bằng mã</h3>
            <form onSubmit={handleJoinByCode} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Nhập mã phòng (VD: ROOM-1A2B)"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                className="flex-1 bg-[#2d303e] text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-[#3b82f6] focus:outline-none uppercase"
              />
              <button 
                type="submit"
                disabled={!joinCode.trim() || isLoading}
                className="bg-[#e6a822] hover:bg-yellow-500 disabled:bg-gray-600 text-black px-4 py-2 rounded-lg font-bold transition"
              >
                Vào
              </button>
            </form>
          </div>

          {/* CREATE ROOM FORM */}
          <div className="bg-[#1f212a] p-5 rounded-2xl border border-gray-700 shadow-md flex-1">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <PlusCircle className="text-[#10b981]" />
              Tạo phòng mới
            </h3>

            {errorMsg && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-medium border border-red-500/50 mb-4">
                {errorMsg}
              </div>
            )}

            <div className="space-y-5">
              {/* Max Players */}
              <div>
                <label className="flex justify-between text-gray-300 font-medium mb-2">
                  <span>Số người chơi (Max)</span>
                  <span className="text-white font-bold">{maxPlayers}</span>
                </label>
                <input 
                  type="range" min="3" max="15" 
                  value={maxPlayers} 
                  onChange={e => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full accent-[#3b82f6]"
                />
              </div>

              {/* Black Hats */}
              <div>
                <label className="flex justify-between text-gray-300 font-medium mb-2">
                  <span>Số lượng Mũ Đen (Nội gián)</span>
                  <span className="text-red-400 font-bold">{maxBlackHats}</span>
                </label>
                <input 
                  type="range" min="1" max="6" 
                  value={maxBlackHats} 
                  onChange={e => setMaxBlackHats(parseInt(e.target.value))}
                  className="w-full accent-red-500"
                />
              </div>

              {/* White Hats */}
              <div>
                <label className="flex justify-between text-gray-300 font-medium mb-2">
                  <span>Số lượng Mũ Trắng (Kẻ ngốc)</span>
                  <span className="text-gray-100 font-bold">{maxWhiteHats}</span>
                </label>
                <input 
                  type="range" min="0" max="3" 
                  value={maxWhiteHats} 
                  onChange={e => setMaxWhiteHats(parseInt(e.target.value))}
                  className="w-full accent-gray-400"
                />
              </div>

              {/* Public/Private */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  className={`flex-1 py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${isPublic ? 'bg-[#10b981] text-white' : 'bg-[#2d303e] text-gray-400'}`}
                >
                  <Unlock size={18} /> Công khai
                </button>
                <button
                  onClick={() => setIsPublic(!isPublic)}
                  className={`flex-1 py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition ${!isPublic ? 'bg-red-500 text-white' : 'bg-[#2d303e] text-gray-400'}`}
                >
                  <Lock size={18} /> Riêng tư
                </button>
              </div>

              <button 
                onClick={handleCreateRoom}
                disabled={isLoading}
                className="w-full mt-6 bg-gradient-to-r from-[#e6a822] to-[#f59e0b] hover:from-[#f59e0b] hover:to-[#d97706] text-black py-4 rounded-xl font-black text-lg transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isLoading ? "ĐANG TẠO..." : "TẠO PHÒNG"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
