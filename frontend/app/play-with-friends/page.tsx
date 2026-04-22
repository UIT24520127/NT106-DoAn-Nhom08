"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as signalR from "@microsoft/signalr";
import { 
  Users, Lock, Unlock, Search, PlusCircle, ArrowLeft, 
  EyeOff, UserX, Shield, Crosshair, Fingerprint, Ghost, Key, UserCheck
} from "lucide-react";
import { getSignalRConnection } from "@/lib/signalRConnection";

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
  
  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form State
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [maxBlackHats, setMaxBlackHats] = useState(1);
  const [maxWhiteHats, setMaxWhiteHats] = useState(1);
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const civilianCount = maxPlayers - maxBlackHats - maxWhiteHats;

  const handleMaxPlayersChange = (val: number) => {
    setMaxPlayers(val);
    let newBlack = maxBlackHats;
    let newWhite = maxWhiteHats;
    // Tự động giảm Mũ Trắng/Mũ Đen nếu giảm Tổng số người dẫn đến Dân < 2
    while (val - newBlack - newWhite < 2) {
      if (newWhite > 0) newWhite--;
      else if (newBlack > 1) newBlack--;
      else break;
    }
    setMaxBlackHats(newBlack);
    setMaxWhiteHats(newWhite);
  };

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    
    const connection = getSignalRConnection(token);
    setHubConnection(connection);

    // Xóa các event listener cũ để tránh bị trùng lặp khi component mount/unmount nhiều lần
    connection.off("PublicRoomsList");
    connection.off("RoomCreated");
    connection.off("RoomJoined");
    connection.off("RoomError");

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

    if (connection.state === signalR.HubConnectionState.Disconnected) {
      connection.start()
        .then(() => {
          connection.invoke("GetPublicRooms");
        })
        .catch(err => console.log("SignalR Connection Info: ", err.toString()));
    } else if (connection.state === signalR.HubConnectionState.Connected) {
      connection.invoke("GetPublicRooms");
    }

    return () => {
      // KHÔNG GỌI connection.stop() Ở ĐÂY ĐỂ GIỮ KẾT NỐI KHI CHUYỂN TRANG
      connection.off("PublicRoomsList");
      connection.off("RoomCreated");
      connection.off("RoomJoined");
      connection.off("RoomError");
    };
  }, [router]);

  const handleCreateRoom = async () => {
    if (!hubConnection) return;
    
    if (civilianCount <= 1) {
      setErrorMsg("Số lượng dân phải từ 2 trở lên để trò chơi cân bằng!");
      setTimeout(() => setErrorMsg(""), 4000);
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
    <div className="relative h-screen w-screen bg-[url('/bg.png')] bg-cover bg-center overflow-hidden flex flex-col">
      {/* OVERLAY TỐI ĐỂ DỄ NHÌN HƠN */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none"></div>

      {/* HEADER */}
      <div className="relative z-10 flex items-center justify-between p-6 bg-black/60 backdrop-blur-md border-b border-gray-700/50 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/menu')}
            className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition backdrop-blur-sm border border-white/10"
          >
            <ArrowLeft className="text-white" size={24} />
          </button>
          <div className="flex items-center gap-3">
            <Fingerprint className="text-[#e6a822]" size={36} />
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#e6a822] to-yellow-200 tracking-wider drop-shadow-md">
              SẢNH CHỜ
            </h1>
          </div>
        </div>
        
        {/* ACTION BAR (RIGHT) */}
        <div className="flex items-center gap-6">
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Key className="text-gray-400" size={18} />
              </div>
              <input 
                type="text" 
                placeholder="NHẬP MÃ PHÒNG"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                className="pl-10 pr-4 py-3 bg-black/50 text-white rounded-xl border border-gray-600 focus:border-[#3b82f6] focus:outline-none uppercase font-bold tracking-widest w-48 backdrop-blur-sm placeholder:text-gray-500 placeholder:font-normal"
              />
            </div>
            <button 
              type="submit"
              disabled={!joinCode.trim() || isLoading}
              className="bg-[#3b82f6] hover:bg-blue-500 disabled:bg-gray-600/50 text-white px-6 py-3 rounded-xl font-black transition shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30"
            >
              VÀO
            </button>
          </form>

          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-[#e6a822] hover:bg-yellow-400 text-black px-8 py-3 rounded-xl font-black transition shadow-[0_0_20px_rgba(230,168,34,0.6)] hover:scale-105 active:scale-95"
          >
            <PlusCircle size={22} strokeWidth={2.5} />
            TẠO PHÒNG
          </button>
        </div>
      </div>

      {/* MAIN CONTENT: PUBLIC ROOMS LIST */}
      <div className="relative z-10 flex-1 overflow-hidden p-8 flex flex-col items-center">
        <div className="w-full max-w-6xl flex-1 bg-black/50 backdrop-blur-lg rounded-3xl border border-white/10 shadow-2xl p-8 flex flex-col overflow-hidden">
          <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3 drop-shadow-md">
            <Search className="text-[#3b82f6]" size={32} />
            PHÒNG CÔNG KHAI
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
            {publicRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
                <Ghost size={80} className="text-gray-500 mb-6 animate-pulse" />
                <h3 className="text-2xl font-bold text-white mb-2">Thật tĩnh lặng...</h3>
                <p className="text-gray-400 text-lg">Chưa có ai tạo phòng công khai. Hãy là người đầu tiên!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicRooms.map(room => (
                  <div key={room.roomId} className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-2xl p-6 flex flex-col justify-between border border-gray-700/50 hover:border-[#3b82f6] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] transition group">
                    <div className="mb-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-2xl font-black text-white tracking-wide">{room.roomId}</h3>
                        <div className="bg-black/40 px-3 py-1 rounded-full border border-gray-600 flex items-center gap-2">
                          <Users size={16} className="text-[#3b82f6]" />
                          <span className="text-white font-bold">{room.playerCount} / {room.maxPlayers}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm font-medium">
                        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                          <EyeOff size={18} /> Nội gián: {room.maxBlackHats}
                        </div>
                        <div className="flex items-center gap-2 text-gray-300 bg-gray-400/10 px-3 py-1.5 rounded-lg border border-gray-500/20">
                          <UserX size={18} /> Kẻ ngốc: {room.maxWhiteHats}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleJoinPublicRoom(room.roomId)}
                      disabled={room.playerCount >= room.maxPlayers || isLoading}
                      className="w-full bg-white/10 hover:bg-[#3b82f6] disabled:bg-gray-700 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 group-hover:bg-[#3b82f6]"
                    >
                      {room.playerCount >= room.maxPlayers ? "ĐÃ ĐẦY" : "THAM GIA NGAY"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE ROOM MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gradient-to-b from-[#252836] to-[#1f212a] w-full max-w-md p-8 rounded-3xl border border-gray-600 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative transform transition-all">
            
            <button 
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white bg-black/30 p-2 rounded-full transition"
            >
              <ArrowLeft className="rotate-180" size={20} />
            </button>

            <h3 className="text-2xl font-black text-white mb-8 flex items-center gap-3">
              <Crosshair className="text-[#10b981]" size={28} />
              TẠO ĐIỆP VỤ MỚI
            </h3>

            {errorMsg && (
              <div className="bg-red-500/20 text-red-400 p-4 rounded-xl text-sm font-medium border border-red-500/50 mb-6 flex items-start gap-3">
                <Shield className="shrink-0 mt-0.5" size={18} />
                {errorMsg}
              </div>
            )}

            <div className="space-y-8">
              {/* Max Players */}
              <div>
                <label className="flex justify-between text-gray-300 font-bold mb-3">
                  <span className="flex items-center gap-2"><Users size={18} className="text-[#3b82f6]"/> Tổng người chơi</span>
                  <span className="text-white text-xl bg-black/30 px-3 py-0.5 rounded-lg border border-gray-600">{maxPlayers}</span>
                </label>
                <input 
                  type="range" min="3" max="15" 
                  value={maxPlayers} 
                  onChange={e => handleMaxPlayersChange(parseInt(e.target.value))}
                  className="w-full accent-[#3b82f6] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Black Hats */}
              <div>
                <label className="flex justify-between text-gray-300 font-bold mb-3">
                  <span className="flex items-center gap-2 text-red-400"><EyeOff size={18}/> Mũ Đen (Nội gián)</span>
                  <span className="text-white text-xl bg-black/30 px-3 py-0.5 rounded-lg border border-red-500/30">{maxBlackHats}</span>
                </label>
                <input 
                  type="range" min="1" max={Math.max(1, Math.min(6, maxPlayers - maxWhiteHats - 2))} 
                  value={maxBlackHats} 
                  onChange={e => setMaxBlackHats(parseInt(e.target.value))}
                  className="w-full accent-red-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* White Hats */}
              <div>
                <label className="flex justify-between text-gray-300 font-bold mb-3">
                  <span className="flex items-center gap-2 text-gray-400"><UserX size={18}/> Mũ Trắng (Kẻ ngốc)</span>
                  <span className="text-white text-xl bg-black/30 px-3 py-0.5 rounded-lg border border-gray-500/30">{maxWhiteHats}</span>
                </label>
                <input 
                  type="range" min="0" max={Math.max(0, Math.min(3, maxPlayers - maxBlackHats - 2))} 
                  value={maxWhiteHats} 
                  onChange={e => setMaxWhiteHats(parseInt(e.target.value))}
                  className="w-full accent-gray-400 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Civilians (Auto calculated) */}
              <div className="bg-green-500/10 p-4 rounded-2xl border border-green-500/20">
                <label className="flex justify-between text-green-400 font-bold items-center">
                  <span className="flex items-center gap-2"><UserCheck size={18}/> Dân Thường</span>
                  <span className="text-white text-2xl font-black bg-black/40 px-4 py-1 rounded-xl border border-green-500/40">
                    {civilianCount}
                  </span>
                </label>
              </div>

              {/* Public/Private Toggles */}
              <div className="flex items-center gap-4 pt-4">
                <button
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 py-4 rounded-xl font-bold flex flex-col justify-center items-center gap-2 transition border ${isPublic ? 'bg-[#10b981]/20 border-[#10b981] text-[#10b981] shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-black/30 border-gray-700 text-gray-500 hover:bg-black/50'}`}
                >
                  <Unlock size={24} /> 
                  <span>Công khai</span>
                </button>
                <button
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 py-4 rounded-xl font-bold flex flex-col justify-center items-center gap-2 transition border ${!isPublic ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-black/30 border-gray-700 text-gray-500 hover:bg-black/50'}`}
                >
                  <Lock size={24} /> 
                  <span>Riêng tư</span>
                </button>
              </div>

              <button 
                onClick={handleCreateRoom}
                disabled={isLoading}
                className="w-full mt-4 bg-gradient-to-r from-[#e6a822] to-yellow-500 hover:from-yellow-400 hover:to-yellow-300 text-black py-4 rounded-xl font-black text-xl transition shadow-[0_0_20px_rgba(230,168,34,0.4)] active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
              >
                {isLoading ? "ĐANG THIẾT LẬP..." : <><PlusCircle/> BẮT ĐẦU TẠO PHÒNG</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
