"use client";
const getLS = () => typeof window !== 'undefined' ? (window as any).localStorage : null;

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { logout, API_URL } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, X, Check } from "lucide-react";
import { ref, onValue, off, set, onDisconnect } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";

// Tổng hợp âm thanh retro
const playNotificationSound = (type: "message" | "invite") => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === "message") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === "invite") {
      const playTone = (freq: number, delay: number, dur: number) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        g.gain.setValueAtTime(0, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + delay + dur);
        o.start(audioCtx.currentTime + delay);
        o.stop(audioCtx.currentTime + delay + dur);
      };
      playTone(523.25, 0, 0.15); // C5
      playTone(659.25, 0.08, 0.15); // E5
      playTone(783.99, 0.16, 0.25); // G5
    }
  } catch (err) {
    // blocked by browser autoplay policy
  }
};

export default function SessionGuard() {
  const pathname = usePathname();
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [invite, setInvite] = useState<{roomId: string, inviterName: string} | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [isClosingInvite, setIsClosingInvite] = useState(false);
  const [friendNotification, setFriendNotification] = useState<string | null>(null);
  const router = useRouter();

  // Đếm ngược 30 giây cho Popup mời vào phòng
  useEffect(() => {
    if (!invite) return;
    
    // Phát âm thanh mời chơi cực ngầu
    playNotificationSound("invite");
    setIsClosingInvite(false);
    
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleDeclineInvite(); // Từ chối tự động
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [invite]);

  const handleDeclineInvite = () => {
    setIsClosingInvite(true);
    setTimeout(() => {
      setInvite(null);
      setIsClosingInvite(false);
    }, 300);
  };

  const handleAcceptInvite = () => {
    setIsClosingInvite(true);
    setTimeout(() => {
      if (invite) {
        router.push(`/room/${invite.roomId}`);
      }
      setInvite(null);
      setIsClosingInvite(false);
    }, 300);
  };

  useEffect(() => {
    // Chỉ giám sát khi không ở trang đăng nhập
    if (pathname === "/login") {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
      return;
    }

    let unsubUnread: () => void = () => {};
    let unsubConnected: () => void = () => {};

    const startConnection = async () => {
      const uid = sessionStorage.getItem("userId");
      if (!uid || uid === "null" || uid === "undefined") {
        return; 
      }

      // 1. Quản lý trạng thái Presence thông qua Firebase .info/connected
      const myPresenceRef = ref(realtimeDb, `presence/${uid}`);
      const connectedRef = ref(realtimeDb, ".info/connected");
      
      unsubConnected = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
          const disconnectRef = onDisconnect(myPresenceRef);
          disconnectRef.set({
            status: "Offline",
            lastSeen: Date.now()
          }).then(() => {
            // Khi kết nối thành công, đặt trạng thái tùy thuộc vào trang đang đứng
            const isInGame = window.location.pathname.includes("/game/");
            const isInRoom = window.location.pathname.includes("/room/");
            let currentStatus = "Online";
            if (isInGame) currentStatus = "In-Match";
            else if (isInRoom) currentStatus = "In-Room";
            
            set(myPresenceRef, {
              status: currentStatus,
              lastSeen: Date.now()
            });
          });
        }
      });

      // 2. Kết nối Realtime Database để nghe thông báo tin nhắn chưa đọc và phát âm thanh
      const unreadRef = ref(realtimeDb, `unread_messages/${uid}`);
      let previousKeysLength = 0;
      
      unsubUnread = onValue(unreadRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const keysLength = Object.keys(data).length;
          // Nếu số lượng hội thoại chưa đọc tăng lên, phát âm thanh!
          if (keysLength > previousKeysLength) {
            playNotificationSound("message");
          }
          previousKeysLength = keysLength;
        } else {
          previousKeysLength = 0;
        }
      });

      // 3. Kết nối SignalR SessionHub
      if (connectionRef.current && connectionRef.current.state === signalR.HubConnectionState.Connected) {
        return;
      }

      if (connectionRef.current) {
        connectionRef.current.stop();
      }

      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_URL}/sessionhub`, {
          skipNegotiation: true,
          transport: signalR.HttpTransportType.WebSockets
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.None)
        .build();

      connection.on("ForceLogout", () => {
        setShowPopup(true);
      });

      connection.on("ReceiveFriendRequest", (data) => {
        playNotificationSound("message");
        setFriendNotification("Bạn nhận được một lời mời kết bạn mới!");
        setTimeout(() => setFriendNotification(null), 5000);
      });

      connection.on("ReceiveRoomInvite", (data: { roomId: string, inviterName: string }) => {
        setInvite(data);
      });

      try {
        await connection.start();
        await connection.invoke("RegisterSession", uid);
        connectionRef.current = connection;
      } catch (err) {
        console.error("Lỗi khi kết nối SessionHub:", err);
      }
    };

    startConnection();

    return () => {
      unsubUnread();
      unsubConnected();
      
      // Hủy trạng thái Online ngay lập tức khi component unmount / logout
      const uid = sessionStorage.getItem("userId");
      if (uid && uid !== "null" && uid !== "undefined") {
        const myPresenceRef = ref(realtimeDb, `presence/${uid}`);
        set(myPresenceRef, {
          status: "Offline",
          lastSeen: Date.now()
        });
      }
    };
  }, [pathname]);

  const handleConfirmLogout = async () => {
    setShowPopup(false);
    getLS()?.removeItem("userId");
    await logout(); // This will clear token and redirect to /login
  };

  const forceLogoutPopup = (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a1c23] border border-red-500/50 rounded-2xl p-8 max-w-sm w-[90%] flex flex-col items-center text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/30">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-white mb-3">Cài đặt bảo mật</h3>
        <p className="text-gray-400 mb-8 text-sm leading-relaxed">
          Tài khoản này hiện đang được đăng nhập thiết bị khác. Phiên của bạn đã bị ngắt.
        </p>
        <button
          onClick={handleConfirmLogout}
          className="w-full bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold py-3 rounded-xl transition-all shadow-[0_5px_0_#991b1b] active:translate-y-[5px] active:shadow-none"
        >
          Xác nhận & Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <>
      {showPopup && forceLogoutPopup}
      
      {/* Toast cho Friend Request */}
      {friendNotification && (
        <div className="fixed top-5 right-5 z-[9999] bg-[#1a1c23] border-l-4 border-amber-500 text-white p-4 rounded-xl shadow-2xl animate-fade-in border border-gray-800">
          <p className="font-extrabold text-amber-500 mb-1 text-xs uppercase tracking-wider">Thông báo đặc vụ</p>
          <p className="text-xs text-gray-300 font-semibold">{friendNotification}</p>
        </div>
      )}

      {/* Toast Mời vào phòng có Countdown */}
      {invite && (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none flex flex-col items-end">
            <div
                className={`pointer-events-auto bg-[#14161f] border border-gray-800 rounded-xl p-4 w-80 shadow-[0_10px_40px_rgba(0,0,0,0.6)] flex flex-row items-center justify-between gap-4 transition-all duration-300 ${
                  isClosingInvite 
                    ? 'translate-x-[150%] opacity-0' 
                    : 'animate-in slide-in-from-right-full'
                }`}
            >
                <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-black text-white mb-1 uppercase tracking-wider flex items-center gap-2">
                        <span>Mật thư mời phòng</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 truncate">
                        Đặc vụ <span className="text-[#e6a822] font-black">{invite.inviterName}</span> mời bạn.
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 font-bold">
                        Tự động từ chối sau: <span className="text-red-400">{countdown}s</span>
                    </p>
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleDeclineInvite}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#1a1c23] hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors border border-gray-800 hover:border-red-500/50"
                        title="Từ chối"
                    >
                        <X size={16} strokeWidth={3} />
                    </button>
                    <button
                        onClick={handleAcceptInvite}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#e6a822] hover:bg-yellow-400 text-black transition-transform hover:scale-110 shadow-[0_0_15px_rgba(230,168,34,0.3)]"
                        title="Tham gia"
                    >
                        <Check size={18} strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
      )}
    </>
  );
}
