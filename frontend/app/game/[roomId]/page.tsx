"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import ChatBox from '@/components/ChatBox'; // Đảm bảo đường dẫn này đúng với dự án của bạn

export default function RoomPage() {
    const params = useParams();
    const roomId = params.roomId as string;
    
    const [connection, setConnection] = useState<HubConnection | null>(null);
    const [currentUser, setCurrentUser] = useState<string>("");
    
    // 1. Thêm State để quản lý việc đóng/mở
    const [isChatOpen, setIsChatOpen] = useState(false);

    const [userStats, setUserStats] = useState<any>(null);

    useEffect(() => {
        // Chỉ chạy khi đã ở trình duyệt (Client-side)
        const savedName = localStorage.getItem("username");
        
        if (savedName) {
            setCurrentUser(savedName);
        } else {
            // Nếu lỡ may chưa có (do xóa cache), thì mới dùng tên tạm
            const tempName = "Player_" + Math.floor(Math.random() * 1000);
            setCurrentUser(tempName);
            localStorage.setItem("username", tempName);
        }
    
        const token = localStorage.getItem("token");
        
        // Khởi tạo SignalR với token...
        const newConnection = new HubConnectionBuilder()
            .withUrl("http://localhost:5120/gamehub", {
                accessTokenFactory: () => token || ""
            })
            .withAutomaticReconnect()
            .build();

        // 3. ĐỂ MÌNH CŨNG THẤY TIN NHẮN: Lắng nghe sự kiện từ Server
        // Khi Server phát "ReceiveMessage", log này sẽ báo cho bạn biết
        newConnection.on("ReceiveMessage", (user, message) => {
            console.log(`[Tin nhắn mới] ${user}: ${message}`);
            // Logic hiển thị thực tế thường nằm trong ChatBox.tsx 
            // thông qua việc lắng nghe connection.on
        });

        async function start() {
            try {
                await newConnection.start();
                console.log("✅ Đã kết nối vào GameHub!");
                await newConnection.invoke("JoinRoom", roomId);
                setConnection(newConnection);
            } catch (err) {
                console.error("❌ Lỗi kết nối SignalR: ", err);
            }
        }

        start();

        // 4. HÀM GIẢI PHÓNG RAM: Quan trọng để tránh lỗi 10GB RAM
        return () => {
            if (newConnection) {
                newConnection.off("ReceiveMessage"); // Gỡ lắng nghe
                newConnection.stop(); // Ngắt kết nối
                console.log("🧹 Đã dọn dẹp kết nối cũ");
            }
        };
    }, [roomId]); // Chỉ chạy lại khi roomId thay đổi

    useEffect(() => {
        if (connection) {
            connection.start()
                .then(() => {
                    console.log("Đã kết nối vào GameHub thành công!");
                    
                    // 3. Tự động join vào Group dựa trên roomId từ URL
                    // Lưu ý: Bạn nên thêm hàm JoinGroup ở Backend để đảm bảo người chơi vào đúng phòng khi truy cập trực tiếp link
                    connection.invoke("JoinRoom", roomId); 
                })
                .catch(err => console.error("Lỗi kết nối SignalR: ", err));
        }
    }, [connection, roomId]);

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 relative">
            <h1 className="text-2xl font-bold text-white mb-6">
                Phòng: {roomId}
            </h1>
            
            {/* 2. Nút bấm nổi (Floating Button) */}
            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-90"
            >
                {isChatOpen ? "✖" : "💬"}
            </button>

            {/* 3. Khung Chat với cơ chế ẩn/hiện bằng CSS */}
            <div className={`fixed bottom-24 right-6 w-80 sm:w-96 transition-all duration-300 transform ${
                isChatOpen 
                ? "scale-100 opacity-100 translate-y-0" 
                : "scale-95 opacity-0 translate-y-10 pointer-events-none"
            }`}>
                {connection ? (
                    <ChatBox 
                        connection={connection} 
                        roomId={roomId} 
                        currentUser={currentUser} 
                    />
                ) : (
                    <div className="text-white bg-gray-800 p-4 rounded shadow">Đang kết nối...</div>
                )}
            </div>

            <div className="mt-4 text-gray-500 text-sm">
                Đang chơi với tên: <span className="text-blue-400">{currentUser}</span>
            </div>
        </div>
    );
};
