"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { Fingerprint, Shield } from 'lucide-react'; 
import ChatBox from '@/components/ChatBox';

export default function RoomPage() {
    const params = useParams();
    const roomId = params.roomId as string;
    
    const [connection, setConnection] = useState<HubConnection | null>(null);
    const [roomState, setRoomState] = useState<any>(null); 
    // Thay đổi dòng này trong page.tsx
    const [currentUser, setCurrentUser] = useState<string>(
        typeof window !== 'undefined' ? (localStorage.getItem("username") || "Người chơi") : "Đang tải..."
    );
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Dùng Ref để giữ kết nối xuyên suốt các lần render
    const connectionRef = useRef<HubConnection | null>(null);
    const isProcessing = useRef(false);

    useEffect(() => {
        // 1. Kiểm tra Token ngay lập tức trước khi làm bất cứ việc gì khác
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
        
        if (!token) {
            console.error("❌ Không tìm thấy Token!");
            // Có thể dùng router.push('/') nếu muốn đá về trang chủ
            return;
        }
    
        if (isProcessing.current) return;
        isProcessing.current = true;
    
        // 2. Khởi tạo kết nối với accessTokenFactory lấy token "tươi" từ localStorage
        const conn = new HubConnectionBuilder()
        .withUrl("http://localhost:5120/gamehub", {
            // LUÔN lấy token mới nhất từ local storage khi kết nối lại
            accessTokenFactory: () => localStorage.getItem("token") || "" 
        })
        .withAutomaticReconnect()
        .build();

        const startConnection = async () => {
            try {
                if (conn.state === HubConnectionState.Disconnected) {
                    await conn.start();
                    // PHẢI gọi JoinRoom lại để Server biết bạn đã quay lại ván đấu
                    await conn.invoke("JoinRoom", roomId);
                    await conn.invoke("GetRoomState", roomId); 
                    
                    if (isProcessing.current) {
                        connectionRef.current = conn;
                        setConnection(conn);
                    }
                }
            } catch (err: any) {
                console.error("Lỗi kết nối lại:", err);
            }
        };
    
        // 4. Lắng nghe cập nhật từ Server
        conn.on("RoomUpdated", (room) => {
            setRoomState(room);
            const myId = localStorage.getItem("userId");
            const players = Object.values(room.players || {});
            const me = players.find((p: any) => p.userId === myId) as any;
            
            if (me && me.displayName) {
                setCurrentUser(me.displayName);
            }
        });
    
        startConnection();
    
        return () => {
            isProcessing.current = false;
            if (connectionRef.current) {
                connectionRef.current.stop();
                connectionRef.current = null;
            }
        };
    }, [roomId]);

    if (!roomState) return (
        <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-yellow-600 italic">
            Đang tải dữ liệu trận đấu...
        </div>
    );

    const players = Object.values(roomState.players || {}) as any[];

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4 pt-20 relative">
            
            {/* TỪ KHÓA CỦA BẠN (Sẽ hiện khi ván đấu bắt đầu) */}
            <div className="mb-10 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-[0.3em] mb-2">Mật danh hiện tại</p>
                <div className="bg-black/50 border-2 border-yellow-600/30 px-8 py-2 rounded-full text-white font-black text-xl tracking-widest shadow-[0_0_15px_rgba(230,168,34,0.1)]">
                    ********
                </div>
            </div>

            {/* GRID NGƯỜI CHƠI (Đồng bộ với UI RoomId) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl">
                {players.map((player) => (
                    <div 
                        key={player.userId} 
                        className={`relative p-5 rounded-2xl border-2 transition-all shadow-lg overflow-hidden ${
                            player.isEliminated 
                            ? 'bg-black/40 border-red-900/20 grayscale opacity-60' 
                            : 'bg-white/5 border-yellow-600/20 hover:border-yellow-500/50'
                        }`}
                    >
                        {/* Hiển thị chủ phòng (Host) */}
                        {player.userId === roomState.hostId && (
                            <div className="absolute top-2 right-2 text-yellow-500">
                                <Shield size={14} fill="currentColor" />
                            </div>
                        )}

                        <div className="flex flex-col items-center gap-3">
                            <div className={`p-3 rounded-full ${player.isEliminated ? 'bg-gray-800' : 'bg-yellow-600/10'}`}>
                                <Fingerprint size={28} className={player.isEliminated ? "text-gray-600" : "text-yellow-500"} />
                            </div>
                            <h3 className="text-white font-bold text-center truncate w-full">
                                {player.displayName}
                                {player.userId === localStorage.getItem("userId") && (
                                    <span className="block text-[10px] text-yellow-500 mt-1 uppercase tracking-tighter">(Bạn)</span>
                                )}
                            </h3>
                        </div>
                    </div>
                ))}
            </div>
            
            {/* HỆ THỐNG CHAT */}
            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="fixed bottom-6 right-6 z-50 bg-yellow-600 text-black w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            >
                {isChatOpen ? "✖" : "💬"}
            </button>

            <div className={`fixed bottom-24 right-6 w-80 sm:w-96 transition-all duration-300 transform ${
                isChatOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-10 pointer-events-none"
            }`}>
                {connection && <ChatBox connection={connection} roomId={roomId} currentUser={currentUser} />}
            </div>
        </div>
    );
}