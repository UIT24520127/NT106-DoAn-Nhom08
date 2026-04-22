"use client";
import { useState, useEffect, useRef } from "react";
import { Users, Settings, LogOut, X, User } from "lucide-react";
import { logout } from "@/lib/auth";
import UserProfile from "@/components/UserProfile"; 
import * as signalR from "@microsoft/signalr";
import { useRouter } from "next/navigation";

export default function MainMenu() {
  const [showOptions, setShowOptions] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // 👈 THÊM MỚI
  const settingsRef = useRef<HTMLDivElement>(null); // 👈 THÊM MỚI
  const [isProfileOpen, setIsProfileOpen] = useState(false); //Show profile
  const [playerStats, setPlayerStats] = useState({
    username: "Đang tải...",
    totalGames: 0,
    wins: 0,
    civilianWins: 0,   // ✨ Thêm mới
    undercoverWins: 0, // ✨ Thêm mới
    mrWhiteWins: 0,    // ✨ Thêm mới
    winRate: "0%",
    mostPlayedRole: "---"
  });

  // Các State phục vụ Matchmaking
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Đang kết nối Server");
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);
  const router = useRouter();  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // 👈 THÊM MỚI: Đóng menu khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Gọi backend để lấy thông tin người chơi
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // 1. Lấy UID của user hiện tại
        let uid = localStorage.getItem("userId"); 
        
        if (!uid || uid === "null" || uid === "undefined") {
          console.error("LỖI: Không tìm thấy userId trong localStorage! Bạn đã đăng nhập chưa?");
          return; // Dừng lại không gọi API nếu không có UID
        }

        console.log("Đang gọi API lấy profile cho UID:", uid);
        
        // 2. Gọi API với ID
        const response = await fetch(`https://localhost:7210/api/user/profile/${uid}`); 
        
        if (response.ok) {
          const data = await response.json();
          console.log("Dữ liệu Firestore nhận được:", data);

          // 3. Đổ data từ API vào Modal
          setPlayerStats({
            username: data.username || data.Username || "Đặc vụ ẩn danh",
            totalGames: data.totalGames || data.TotalGames || 0,
            wins: data.wins || data.Wins || 0,
            civilianWins: data.civilianWins || data.CivilianWins || 0,
            undercoverWins: data.undercoverWins || data.UndercoverWins || 0,
            mrWhiteWins: data.mrWhiteWins || data.MrWhiteWins || 0,
            winRate: (data.totalGames || data.TotalGames) > 0 
              ? (((data.wins || data.Wins) / (data.totalGames || data.TotalGames)) * 100).toFixed(1) + "%" 
              : "0%",
            mostPlayedRole: data.mostPlayedRole || data.MostPlayedRole || "Tân binh"
          });
        } else {
          console.error(`LỖI: Không tìm thấy profile trên server. Mã lỗi: ${response.status}`);
          // Có thể in thêm message từ backend nếu có
          const errorData = await response.json().catch(() => null);
          if (errorData) console.error("Chi tiết lỗi từ backend:", errorData);
        }
      } catch (error) {
        console.error("Lỗi kết nối Backend:", error);
      }
    };
  
    if (isProfileOpen) {
      fetchProfile();
    }
  }, [isProfileOpen]);

  const handleLogout = async () => {
    setShowSettingsMenu(false);
    localStorage.removeItem("userId");
    await logout(); // xóa token + redirect về /login tự động
  };

  const handleFindMatch = async () => {
    setIsSearchOverlayOpen(true);
    setSearchStatus("Đang thiết lập kết nối...");

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("https://localhost:7210/gamehub") 
      .withAutomaticReconnect()
      .build();

    setHubConnection(connection);

    connection.on("WaitingForPlayers", (message: string) => {
      setSearchStatus(`⏳ ${message}`);
    });

    connection.on("MatchFound", (data: { roomPin: string, message: string }) => {
      setSearchStatus(`🎉 ${data.message} - Chuẩn bị vào game!`);
      setTimeout(() => {
        router.push(`/game/${data.roomPin}`);
      }, 1500);
    });

    try {
      await connection.start();
      setSearchStatus("Đang tìm kiếm phòng...");
      await connection.invoke("FindMatch");
    } catch (err) {
      console.error("Lỗi khi kết nối SignalR:", err);
      setSearchStatus("❌ Kết nối thất bại. Vui lòng Hủy và thử lại!");
    }
  };

  const handleCancelSearch = async () => {
    if (hubConnection) {
      await hubConnection.stop();
      setHubConnection(null);
    }
    setIsSearchOverlayOpen(false);
  };
  
  // Dọn dẹp kết nối SignalR khi thoái lui (unmount)
  useEffect(() => {
    return () => {
      if (hubConnection) {
        hubConnection.stop();
      }
    };
  }, [hubConnection]);

  return (
    <div className="relative h-screen w-screen bg-[url('/bg.png')] bg-cover bg-center overflow-hidden">

      {/* TIÊU ĐỀ GAME */}
      <div className={`absolute top-[8%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center text-center transition-all duration-1000 ease-out
          ${showTitle ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-8 scale-95'}`}
      >
        <h1 className="text-5xl md:text-7xl font-black text-[#e6a822] tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]"
          style={{ WebkitTextStroke: '2px black' }}>
          UNDERCOVER
        </h1>
        <h2 className="text-2xl md:text-3xl font-bold text-white mt-1 drop-shadow-[0_3px_3px_rgba(0,0,0,1)] italic"
          style={{ WebkitTextStroke: '1px black' }}>
          Ai là gián điệp ?
        </h2>
      </div>

      {/* 3 NÚT GÓC TRÊN PHẢI */}
      <div className="absolute top-6 right-8 flex gap-3 z-20">
        <button className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg">
          <Users size={24} color="white" strokeWidth={2.5} />
        </button>

        {/* 👇 THÊM MỚI: Bọc Settings button trong div có ref để detect click ngoài */}
        <div ref={settingsRef} className="relative">
          <button
            onClick={() => setShowSettingsMenu(prev => !prev)}
            className={`bg-[#1a1c23] p-3 rounded-2xl border-2 transition shadow-lg
              ${showSettingsMenu ? 'border-gray-400' : 'border-transparent hover:border-gray-500'}`}
          >
            <Settings size={24} color="white" strokeWidth={2.5} />
          </button>

          {/* DROPDOWN MENU */}
          {showSettingsMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1c23] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden animate-fade-in">
              
              {/* Header của menu */}
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <span className="text-white font-bold text-sm">Cài đặt</span>
                <button onClick={() => setShowSettingsMenu(false)} className="text-gray-400 hover:text-white transition">
                  <X size={16} />
                </button>
              </div>

              {/* Mục Đăng xuất */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <LogOut size={18} strokeWidth={2.5} />
                <span className="font-semibold text-sm">Đăng xuất</span>
              </button>

              {/* Bạn có thể thêm các mục khác ở đây */}
              {/* Ví dụ:
              <button className="w-full flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition-colors">
                <SomeIcon size={18} />
                <span className="font-semibold text-sm">Âm thanh</span>
              </button>
              */}
            </div>
          )}
        </div>

        <button className="bg-[#1a1c23] p-3 px-4 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg flex items-center justify-center">
          <span className="text-white text-xl font-bold italic">?</span>
        </button>

        <button 
          onClick={() => setIsProfileOpen(true)} // <-- Thêm dòng này để "mở cửa"
          className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg"
        >
          <User size={24} color="white" strokeWidth={2.5} />
        </button>
      </div>

      {/* KHU VỰC TRUNG TÂM */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div className="mt-[500px] flex flex-col items-center">
          {!showOptions ? (
            <button
              onClick={() => setShowOptions(true)}
              className="text-4xl md:text-5xl font-black text-white bg-transparent hover:scale-110 transition-transform duration-300 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              style={{ WebkitTextStroke: '1.5px black' }}
            >
              PLAY
            </button>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <button 
                onClick={handleFindMatch}
                className="bg-[#e6a822] text-black w-40 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none"
              >
                CHƠI NGAY
              </button>
              <button className="bg-[#3b82f6] text-white w-40 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CHƠI VỚI BẠN
              </button>
              <button
                onClick={() => setShowOptions(false)}
                className="mt-2 text-white/80 text-sm font-bold underline hover:text-white drop-shadow-md"
              >
                Quay lại
              </button>
            </div>
          )}
        </div>
      </div>
      <UserProfile 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        stats={playerStats} 
      />

      {/* OVERLAY TÌM TRẬN */}
      {isSearchOverlayOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="flex flex-col items-center text-center">
            {/* Vòng tròn xoay - Animation xịn */}
            <div className="w-20 h-20 border-[5px] border-[#3b82f6]/20 border-t-[#e6a822] rounded-full animate-spin mb-8 shadow-[0_0_15px_#e6a822]"></div>
            
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              Đang tìm kiếm phòng
              <span className="animate-pulse ml-1">...</span>
            </h2>
            
            <p className="text-[#a0aec0] mb-10 text-xl font-medium tracking-wide">
              {searchStatus}
            </p>

            <button 
              onClick={handleCancelSearch}
              className="px-10 py-3 bg-[#1a1c23] hover:bg-red-600 hover:text-white text-red-500 font-bold text-lg rounded-full border-2 border-red-500 hover:border-red-600 transition-all duration-300 shadow-lg active:scale-95"
            >
              HỦY TÌM TRẬN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}