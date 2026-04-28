"use client";

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { logout } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";

export default function SessionGuard() {
  const pathname = usePathname();
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [invite, setInvite] = useState<{roomId: string, inviterName: string} | null>(null);
  const [friendNotification, setFriendNotification] = useState<string | null>(null);
  const router = require("next/navigation").useRouter();

  useEffect(() => {
    // Only monitor on pages other than login
    if (pathname === "/login") {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
      return;
    }

    const startConnection = async () => {
      const uid = localStorage.getItem("userId");
      if (!uid || uid === "null" || uid === "undefined") {
        return; // No user ID, probably not logged in
      }

      // Check if connection already exists and is connected
      if (connectionRef.current && connectionRef.current.state === signalR.HubConnectionState.Connected) {
        return;
      }

      // Stop existing connection if any before starting a new one
      if (connectionRef.current) {
        connectionRef.current.stop();
      }

      const connection = new signalR.HubConnectionBuilder()
        .withUrl("https://localhost:7210/sessionhub", {
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

    // Do NOT stop the connection on cleanup if it's just a re-render or pathname change 
    // where we still want to be protected, EXCEPT if unmounting completely. 
    // Since this is in layout.js, it doesn't unmount except on hard refresh. 
    return () => {
      // Optional: We can leave the connection alive across page navigations
      // to avoid dropping the connection and reconnecting every time page changes.
    };
  }, [pathname]);

  const handleConfirmLogout = async () => {
    setShowPopup(false);
    localStorage.removeItem("userId");
    await logout(); // This will clear token and redirect to /login
  };

  // Remove the early return so other modals can render
  // if (!showPopup) return null;

  const forceLogoutPopup = (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a1c23] border border-red-500/50 rounded-2xl p-8 max-w-sm w-[90%] flex flex-col items-center text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/30">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-white mb-3">Cảnh báo bảo mật</h3>
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
        <div className="fixed top-5 right-5 z-[9999] bg-gray-800 border-l-4 border-amber-500 text-white p-4 rounded shadow-xl animate-fade-in">
          <p className="font-bold text-amber-500 mb-1">Thông báo hệ thống</p>
          <p className="text-sm">{friendNotification}</p>
        </div>
      )}

      {/* Popup Mời vào phòng */}
      {invite && (
        <div
            className="fixed inset-0 bg-black/65 z-[9999] flex items-center justify-center"
            onClick={() => setInvite(null)}
        >
            <div
                className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-6 w-72 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-12 rounded-full bg-indigo-950 flex items-center justify-center mx-auto mb-4">
                    <LogIn size={22} color="#818cf8" strokeWidth={2.5} />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Lời mời vào phòng</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    <span className="text-amber-400 font-bold">{invite.inviterName}</span>
                    {" "}đã mời bạn vào phòng chơi.
                    <br />Bạn có muốn tham gia không?
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => setInvite(null)}
                        className="flex-1 py-2 rounded-xl bg-[#111317] text-gray-400 border border-gray-700 text-xs font-semibold hover:bg-gray-800 transition"
                    >
                        Từ chối
                    </button>
                    <button
                        onClick={() => {
                          setInvite(null);
                          router.push(`/room/${invite.roomId}`);
                        }}
                        className="flex-1 py-2 rounded-xl bg-indigo-900 text-indigo-300 border border-indigo-800 text-xs font-semibold hover:bg-indigo-800 transition"
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
