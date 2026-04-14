"use client";
import { useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";

export default function TestMatchPage() {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(null);
  const [status, setStatus] = useState("Chưa kết nối");
  const [room, setRoom] = useState("");

  useEffect(() => {
    // 1. Khởi tạo kết nối tới GameHub của Server C#
    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"}/gamehub`) // Đảm bảo đúng cổng Server của bạn
      .withAutomaticReconnect()
      .build();

    setConnection(newConnection);
  }, []);

  useEffect(() => {
    if (connection) {
      // 2. Bắt đầu kết nối
      connection.start()
        .then(() => setStatus("🟢 Đã kết nối tới Server! Sẵn sàng."))
        .catch((e) => console.log("Lỗi kết nối: ", e));

      // 3. Lắng nghe Server phản hồi khi "Đang đợi"
      connection.on("WaitingForPlayers", (message: string) => {
        setStatus(`⏳ ${message}`);
      });

      // 4. Lắng nghe Server phản hồi khi "Tìm thấy trận"
      connection.on("MatchFound", (data: { roomPin: string, message: string }) => {
        setStatus(`🎉 ${data.message}`);
        setRoom(data.roomPin);
      });
    }
  }, [connection]);

  // Hàm khi bấm nút CHƠI NGAY
  const handleFindMatch = async () => {
    if (connection) {
      try {
        await connection.invoke("FindMatch"); // Gọi đúng tên hàm trong GameHub.cs
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white font-sans">
      <h1 className="text-3xl font-bold mb-4">TEST TÌM TRẬN (MATCHMAKING)</h1>
      <p className="mb-6 text-yellow-400">{status}</p>

      {room && (
        <div className="bg-green-600 px-6 py-3 rounded-lg mb-6 text-2xl font-black shadow-lg">
          MÃ PHÒNG: {room}
        </div>
      )}

      <button
        onClick={handleFindMatch}
        className="bg-red-700 hover:bg-red-600 px-8 py-3 rounded text-xl font-bold transition-transform active:scale-95"
      >
        CHƠI NGAY
      </button>
    </div>
  );
}