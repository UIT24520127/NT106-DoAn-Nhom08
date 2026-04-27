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

    //Voice Chat
    // Thêm vào cùng chỗ với các useState khác
    const [isMicOn, setIsMicOn] = useState(true);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);

    // Hàm xử lý bật/tắt (Sau này bạn sẽ gọi SDK Voice Chat ở đây)
    const toggleMic = () => {
        setIsMicOn(!isMicOn);
        console.log(isMicOn ? "Đã tắt Mic" : "Đã bật Mic");
    };

    const toggleSpeaker = () => {
        setIsSpeakerOn(!isSpeakerOn);
        console.log(isSpeakerOn ? "Đã tắt Loa" : "Đã bật Loa");
    };
    
    //Chat
    // 1. Thêm State để quản lý việc đóng/mở
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        // 1. Giả lập tên người dùng (Sau này bạn sẽ lấy từ Auth hoặc input)
        const randomName = "Player_" + Math.floor(Math.random() * 1000);
        setCurrentUser(randomName);

        // 2. Khởi tạo kết nối SignalR đến GameHub
        const newConnection = new HubConnectionBuilder()
            .withUrl("http://localhost:5120/gamehub") // Thay bằng URL Backend của bạn
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Information)
            .build();

        setConnection(newConnection);
    }, []);

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
            
            <div className="fixed bottom-6 right-6 z-50 flex gap-3">
    
                {/* Nút Loa */}
                <button 
                    onClick={toggleSpeaker}
                    className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90 ${
                        isSpeakerOn ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-700"
                    } text-white`}
                    title={isSpeakerOn ? "Tắt Loa" : "Bật Loa"}
                >
                    {isSpeakerOn ? "🔊" : "🔇"}
                </button>

                {/* Nút Micro */}
                <button 
                    onClick={toggleMic}
                    className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90 ${
                        isMicOn ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"
                    } text-white`}
                    title={isMicOn ? "Tắt Mic" : "Bật Mic"}
                >
                    {isMicOn ? "🎙️" : "🚫"}
                </button>

                {/* Nút Chat Box hiện tại */}
                <button 
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-90"
                >
                    {isChatOpen ? "✖" : "💬"}
                </button>
            </div>

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
