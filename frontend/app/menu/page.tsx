"use client";
const getLS = () => typeof window !== 'undefined' ? (window as any).localStorage : null;
import { useState, useEffect, useRef } from "react";
import { Users, Settings, LogOut, X, User } from "lucide-react";
import { logout, API_URL } from "@/lib/auth";
import UserProfile from "@/components/UserProfile";
import FriendModal from "@/components/friends/FriendModal"; 
import * as signalR from "@microsoft/signalr";
import { getSignalRConnection } from "@/lib/signalRConnection";
import { ref, onValue } from "firebase/database";      
import { realtimeDb } from "@/lib/firebase";            
import { useRouter } from "next/navigation";
import { useGameSound } from "@/hooks/useGameSound";

// ─── Avatar Cache Helpers ────────────────────────────────────────────────────
// Lưu avatar DiceBear dưới dạng Base64 trong localStorage để tránh gọi lại
// api.dicebear.com mỗi lần render. Cache bị xóa khi URL avatar thay đổi.

function getAvatarCacheKey(uid: string) {
  return `avatar_cache_${uid}`;
}
function getAvatarCacheUrlKey(uid: string) {
  return `avatar_cache_url_${uid}`;
}

/** Trả về Base64 đã cache nếu URL khớp, ngược lại trả về null */
function getAvatarFromCache(uid: string, avatarUrl: string): string | null {
  try {
    const cachedUrl = getLS()?.getItem(getAvatarCacheUrlKey(uid));
    if (cachedUrl !== avatarUrl) return null; // URL đổi rồi → cache không còn hợp lệ
    return getLS()?.getItem(getAvatarCacheKey(uid));
  } catch {
    return null;
  }
}

/** Lưu Base64 avatar vào cache kèm URL tương ứng */
function saveAvatarToCache(uid: string, avatarUrl: string, base64: string) {
  try {
    getLS()?.setItem(getAvatarCacheKey(uid), base64);
    getLS()?.setItem(getAvatarCacheUrlKey(uid), avatarUrl);
  } catch {
    // Bỏ qua nếu localStorage đầy
  }
}

/** Xóa cache avatar (gọi khi đổi avatar mới) */
function clearAvatarCache(uid: string) {
  try {
    getLS()?.removeItem(getAvatarCacheKey(uid));
    getLS()?.removeItem(getAvatarCacheUrlKey(uid));
  } catch {
    // Bỏ qua
  }
}

/**
 * Download SVG từ DiceBear URL rồi convert sang Base64 để cache.
 * Nếu thành công, lưu vào localStorage và cập nhật state.
 */
async function fetchAndCacheDiceBearAvatar(
  uid: string,
  avatarUrl: string,
  onCached: (base64: string) => void
) {
  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    saveAvatarToCache(uid, avatarUrl, base64);
    onCached(base64);
  } catch {
    // Giữ nguyên URL nếu fetch thất bại
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function MainMenu() {
  const { playClick, playBGM, stopBGM } = useGameSound();
  const [showOptions, setShowOptions] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isFriendOpen, setIsFriendOpen] = useState(false);  
  const [token, setToken] = useState("");                    
  const [pendingCount, setPendingCount] = useState(0);       
  // Lazy initializer: đọc cache avatar từ localStorage NGAY LẬP TỨC (đồng bộ)
  // trước khi render lần đầu → avatar hiển thị không cần chờ API
  const [playerStats, setPlayerStats] = useState({
    username: "Đang tải...",
    totalGames: 0,
    wins: 0,
    civilianWins: 0,
    undercoverWins: 0,
    mrWhiteWins: 0,
    winRate: "0%",
    mostPlayedRole: "---",
    avatar: ""
  });

  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Đang kết nối Server");
  const [hubConnection, setHubConnection] = useState<signalR.HubConnection | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      playBGM();
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setShowTitle(true), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [hasUnread, setHasUnread] = useState(false);

  // 👈 THÊM MỚI: Lấy token + lắng nghe pending friend requests và unread messages từ RTDB
  useEffect(() => {
    const stored = sessionStorage.getItem("token");
    if (stored) setToken(stored);

    const uid = sessionStorage.getItem("userId");
    if (!uid) return;

    // Đọc cache avatar từ localStorage an toàn trên client sau khi component mount (tránh lỗi Hydration Mismatch)
    try {
      const cachedData = getLS()?.getItem(getAvatarCacheKey(uid));
      if (cachedData) {
        setPlayerStats(prev => ({ ...prev, avatar: cachedData }));
      }
    } catch (e) {
      console.error("Lỗi đọc cache avatar:", e);
    }

    const requestsRef = ref(realtimeDb, `friendRequests/${uid}`);
    const unsubRequests = onValue(requestsRef, (snap) => {
      setPendingCount(snap.exists() ? Object.keys(snap.val()).length : 0);
    });

    const unreadRef = ref(realtimeDb, `unread_messages/${uid}`);
    const unsubUnread = onValue(unreadRef, (snap) => {
      setHasUnread(snap.exists());
    });

    return () => {
      unsubRequests();
      unsubUnread();
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const uid = sessionStorage.getItem("userId");
        if (!uid || uid === "null" || uid === "undefined") {
          console.error("LỖI: Không tìm thấy userId trong sessionStorage!");
          return;
        }
        const response = await fetch(`${API_URL}/api/user/profile/${uid}`);
        if (response.ok) {
          const data = await response.json();
          const avatarUrl: string = data.avatar || data.Avatar || "";

          // ── Xử lý Avatar với Cache ──────────────────────────────────────
          let displayAvatar = avatarUrl;

          if (avatarUrl.includes("dicebear.com")) {
            // Kiểm tra cache trước — nếu có thì hiển thị ngay, không cần gọi dicebear.com
            const cached = getAvatarFromCache(uid, avatarUrl);
            if (cached) {
              displayAvatar = cached;
            } else {
              // Chưa có cache: hiển thị URL gốc trước (để không bị trống),
              // đồng thời fetch ngầm và cache lại cho lần sau
              displayAvatar = avatarUrl;
              fetchAndCacheDiceBearAvatar(uid, avatarUrl, (base64) => {
                setPlayerStats(prev => ({ ...prev, avatar: base64 }));
              });
            }
          }
          // ────────────────────────────────────────────────────────────────

          setPlayerStats({
            username: data.username || data.Username || "Đặc vụ ẩn danh",
            totalGames: data.totalGames || data.TotalGames || 0,
            wins: data.totalWins || data.TotalWins || data.wins || data.Wins || 0,
            civilianWins: data.civilianWins || data.CivilianWins || 0,
            undercoverWins: data.undercoverWins || data.UndercoverWins || 0,
            mrWhiteWins: data.mrWhiteWins || data.MrWhiteWins || 0,
            winRate: (data.totalGames || data.TotalGames) > 0
              ? (((data.totalWins || data.TotalWins || data.wins || data.Wins || 0) / (data.totalGames || data.TotalGames)) * 100).toFixed(1) + "%"
              : "0%",
            mostPlayedRole: data.mostPlayedRole || data.MostPlayedRole || "Tân binh",
            avatar: displayAvatar,
          });
        }
      } catch (error) {
        console.error("Lỗi kết nối Backend:", error);
      }
    };
    fetchProfile();
  }, []); // Chỉ fetch 1 lần khi mount — không re-fetch khi đóng/mở modal

  const handleLogout = async () => {
    playClick();
    setShowSettingsMenu(false);
    sessionStorage.removeItem("userId");
    await logout();
  };

  const handleFindMatch = async () => {
    playClick();
    // Add small delay so sound can play
    await new Promise(resolve => setTimeout(resolve, 50));
    setIsSearchOverlayOpen(true);
    setSearchStatus("Đang thiết lập kết nối...");
    const token = sessionStorage.getItem("token") || "";
    const connection = getSignalRConnection(token);
    setHubConnection(connection);
    connection.off("WaitingForPlayers");
    connection.off("RoomJoined");
    connection.off("RoomCreated");
    connection.off("RoomError");
    connection.on("WaitingForPlayers", (message: string) => { setSearchStatus(`⏳ ${message}`); });
    connection.on("RoomJoined", (room: any) => {
      setSearchStatus(`🎉 Đã tìm thấy phòng - Đang vào sảnh...`);
      setTimeout(() => { router.push(`/room/${room.roomId}`); }, 1000);
    });
    connection.on("RoomCreated", (room: any) => {
      setSearchStatus(`🎉 Đã tạo phòng mới - Đang vào sảnh...`);
      setTimeout(() => { router.push(`/room/${room.roomId}`); }, 1000);
    });
    connection.on("RoomError", (message: string) => { setSearchStatus(`❌ ${message}`); });
    try {
      if (connection.state === signalR.HubConnectionState.Disconnected) await connection.start();
      setSearchStatus("Đang tìm kiếm phòng public...");
      await connection.invoke("PlayNow");
    } catch (err) {
      setSearchStatus("❌ Kết nối thất bại. Vui lòng Hủy và thử lại!");
    }
  };

  const handleCancelSearch = async () => {
    playClick();
    if (hubConnection) setHubConnection(null);
    setIsSearchOverlayOpen(false);
  };

  useEffect(() => {
    return () => {
      if (hubConnection) {
        hubConnection.off("WaitingForPlayers");
        hubConnection.off("RoomJoined");
        hubConnection.off("RoomCreated");
        hubConnection.off("RoomError");
      }
    };
  }, [hubConnection]);

  return (
    <div className="relative h-screen w-screen bg-[url('/bg.jpg')] bg-cover bg-center overflow-hidden">

      {/* TIÊU ĐỀ GAME */}
      <div className={`absolute top-[8%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center text-center transition-all duration-1000 ease-out
          ${showTitle ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-8 scale-95'}`}>
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

        {/* 👇 SỬA: Từ router.push('/friends') thành mở FriendSidebar */}
        <button
          onClick={() => { playClick(); setIsFriendOpen(true); }}
          className="relative bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-[#e6a822] hover:shadow-[0_0_15px_rgba(230,168,34,0.3)] transition shadow-lg active:scale-95 duration-200"
        >
          <Users size={24} color="white" strokeWidth={2.5} />
          {/* Badge hoặc Chấm đỏ thông báo phát sáng */}
          {(pendingCount > 0 || hasUnread) && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#1a1c23] animate-pulse shadow-[0_0_8px_#ef4444]" />
          )}
        </button>

        <div ref={settingsRef} className="relative">
          <button
            onClick={() => { playClick(); setShowSettingsMenu(prev => !prev); }}
            className={`bg-[#1a1c23] p-3 rounded-2xl border-2 transition shadow-lg
              ${showSettingsMenu ? 'border-gray-400' : 'border-transparent hover:border-gray-500'}`}
          >
            <Settings size={24} color="white" strokeWidth={2.5} />
          </button>
          {showSettingsMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1c23] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden animate-fade-in">
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <span className="text-white font-bold text-sm">Cài đặt</span>
                <button onClick={() => setShowSettingsMenu(false)} className="text-gray-400 hover:text-white transition">
                  <X size={16} />
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <LogOut size={18} strokeWidth={2.5} />
                <span className="font-semibold text-sm">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => { playClick(); setShowGuide(true); }}
          className="bg-[#1a1c23] p-3 px-4 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg flex items-center justify-center">
          <span className="text-white text-xl font-bold italic">?</span>
        </button>

        <button
          onClick={() => { playClick(); setIsProfileOpen(true); }}
          className="relative bg-[#1a1c23] w-[52px] h-[52px] rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg flex items-center justify-center overflow-hidden"
        >
          {playerStats.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={playerStats.avatar} alt="User Avatar" className="w-full h-full object-cover" />
          ) : (
            <User size={24} color="white" strokeWidth={2.5} />
          )}
        </button>
      </div>

      {/* KHU VỰC TRUNG TÂM */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div className="mt-[500px] flex flex-col items-center">
          {!showOptions ? (
            <button
              onClick={() => { playClick(); setShowOptions(true); }}
              className="text-4xl md:text-5xl font-black text-white bg-transparent hover:scale-110 transition-transform duration-300 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              style={{ WebkitTextStroke: '1.5px black' }}
            >
              PLAY
            </button>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <button onClick={handleFindMatch}
                className="bg-[#e6a822] text-black w-48 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CHƠI NGAY
              </button>
              <button onClick={() => { playClick(); setTimeout(() => router.push('/play-with-friends'), 100); }}
                className="bg-[#3b82f6] text-white w-48 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CHƠI VỚI BẠN
              </button>
              <button onClick={() => { playClick(); setShowGuide(true); }}
                className="bg-[#10b981] text-white w-48 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CÁCH CHƠI
              </button>
              <button onClick={() => { playClick(); setShowOptions(false); }}
                className="mt-2 text-white/80 text-sm font-bold underline hover:text-white drop-shadow-md">
                QUAY LẠI
              </button>
            </div>
          )}
        </div>
      </div>

      {/* USER PROFILE MODAL */}
      <UserProfile
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        stats={playerStats}
        onAvatarUpdated={(newAvatar) => {
          // Xóa cache cũ khi đổi avatar mới để lần fetch tiếp theo cache lại đúng
          const uid = sessionStorage.getItem("userId") || "";
          if (uid) clearAvatarCache(uid);
          setPlayerStats(prev => ({ ...prev, avatar: newAvatar }));
        }}
        isOwnProfile={true}
      />

      {/* 👇 THÊM MỚI: FRIEND MODAL */}
      {token && (
        <FriendModal
          isOpen={isFriendOpen}
          onClose={() => setIsFriendOpen(false)}
          token={token}
          pendingCount={pendingCount}
        />
      )}

      {/* OVERLAY TÌM TRẬN */}
      {isSearchOverlayOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 border-[5px] border-[#3b82f6]/20 border-t-[#e6a822] rounded-full animate-spin mb-8 shadow-[0_0_15px_#e6a822]"></div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">
              Đang tìm kiếm phòng<span className="animate-pulse ml-1">...</span>
            </h2>
            <p className="text-[#a0aec0] mb-10 text-xl font-medium tracking-wide">{searchStatus}</p>
            <button onClick={handleCancelSearch}
              className="px-10 py-3 bg-[#1a1c23] hover:bg-red-600 hover:text-white text-red-500 font-bold text-lg rounded-full border-2 border-red-500 hover:border-red-600 transition-all duration-300 shadow-lg active:scale-95">
              HỦY TÌM TRẬN
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY HƯỚNG DẪN CHƠI */}
      {showGuide && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in px-4">
          <div className="relative bg-[#1a1c23] border-2 border-[#e6a822] rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-[0_0_30px_rgba(230,168,34,0.3)]">
            <button onClick={() => { playClick(); setShowGuide(false); }} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
              <X size={24} />
            </button>
            <h2 className="text-2xl md:text-3xl font-black text-[#e6a822] mb-6 text-center">
              🕵️ CÁCH CHƠI UNDERCOVER
            </h2>
            <div className="space-y-6 text-gray-200 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
              <section className="bg-black/30 p-4 rounded-xl border border-gray-700">
                <h3 className="text-lg md:text-xl font-bold text-white mb-3 border-b border-gray-600 pb-2">VAI TRÒ:</h3>
                <ul className="space-y-2 font-medium text-sm md:text-base">
                  <li className="flex items-center gap-2"><span className="text-blue-400">🔹</span> <strong>Dân:</strong> Có từ khóa chính.</li>
                  <li className="flex items-center gap-2"><span className="text-orange-400">🔸</span> <strong>Mũ Đen:</strong> Có từ khóa gần giống.</li>
                  <li className="flex items-center gap-2"><span className="text-gray-300">⚪</span> <strong>Mũ Trắng:</strong> Không có từ khóa.</li>
                </ul>
              </section>
              <section className="bg-black/30 p-4 rounded-xl border border-gray-700">
                <h3 className="text-lg md:text-xl font-bold text-white mb-3 border-b border-gray-600 pb-2">LUẬT CHƠI:</h3>
                <p className="leading-relaxed text-justify text-sm md:text-base">
                  Mỗi vòng, mọi người lần lượt dùng một từ duy nhất để mô tả về từ khóa mình đang nắm giữ. Hãy mô tả thật khéo léo để đồng đội nhận ra mình nhưng không để kẻ địch đoán được từ khóa. Sau khi kết thúc lượt mô tả, cả phòng sẽ tiến hành thảo luận qua Chat hoặc Voice Chat để tìm ra người có hành tung đáng ngờ nhất và bỏ phiếu loại. Phe Dân thắng khi loại được toàn bộ kẻ gian, Mũ Đen thắng khi số lượng còn lại bằng với phe Dân, riêng Mũ Trắng nếu bị loại mà đoán đúng được từ khóa của phe Dân thì sẽ lật ngược tình thế và giành chiến thắng chung cuộc.
                </p>
              </section>
            </div>
            <div className="mt-8 flex justify-center">
              <button onClick={() => setShowGuide(false)}
                className="bg-[#e6a822] text-black px-10 py-3 rounded-full text-base md:text-lg font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                ĐÃ HIỂU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
