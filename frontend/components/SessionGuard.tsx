"use client";

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { logout, API_URL } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
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
  const [friendNotification, setFriendNotification] = useState<string | null>(null);
  const router = useRouter();

  // Đếm ngược 10 giây cho Popup mời vào phòng
  useEffect(() => {
    if (!invite) return;
    
    // Phát âm thanh mời chơi cực ngầu
    playNotificationSound("invite");
    
    setCountdown(10);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setInvite(null); // Từ chối tự động
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [invite]);

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
            set(myPresenceRef, {
              status: isInGame ? "In-Match" : "Online",
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
      const uid = localStorage.getItem("userId");
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
    localStorage.removeItem("userId");
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

      {/* Popup Mời vào phòng có Countdown */}
      {invite && (
        <div
            className="fixed inset-0 bg-black/75 z-[9999] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setInvite(null)}
        >
            <div
                className="bg-[#14161f] border-2 border-gray-800 rounded-2xl p-6 w-80 text-center shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-12 rounded-xl bg-indigo-950 flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                    <LogIn size={22} color="#818cf8" strokeWidth={2.5} />
                </div>
                <h3 className="text-sm font-extrabold text-white mb-2 uppercase tracking-wider">Mật thư mời phòng</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    Đặc vụ <span className="text-[#e6a822] font-black">{invite.inviterName}</span> đã gửi lời mời tham gia phòng tác chiến.
                    <br />
                    <span className="block mt-2 font-bold text-gray-500">
                      Tự động từ chối sau: <span className="text-red-500 font-black">{countdown}s</span>
                    </span>
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => setInvite(null)}
                        className="flex-1 py-2.5 rounded-xl bg-[#111317] text-gray-400 border border-gray-700 text-xs font-bold hover:bg-gray-800 transition active:scale-95"
                    >
                        Từ chối
                    </button>
                    <button
                        onClick={() => {
                          setInvite(null);
                          router.push(`/room/${invite.roomId}`);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-[#e6a822] text-black text-xs font-black hover:bg-yellow-400 transition active:scale-95 border-b-2 border-yellow-700"
                    >
                        Tham gia
                    </button>
                </div>
            </div>
        </div>
      )}
    </>
  );
}
