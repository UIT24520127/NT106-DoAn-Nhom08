"use client";

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { logout } from "@/lib/auth";
import { usePathname } from "next/navigation";

export default function SessionGuard() {
  const pathname = usePathname();
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const [showPopup, setShowPopup] = useState(false);

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
        // Thay vì dùng alert, ta kích hoạt popup đẹp
        setShowPopup(true);
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

  if (!showPopup) return null;

  return (
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
}
