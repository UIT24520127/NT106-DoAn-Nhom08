"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
    HubConnection,
    HubConnectionBuilder,
    HubConnectionState
} from '@microsoft/signalr';
import { Shield } from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import { ref, set } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import { API_URL } from '@/lib/auth';

type PeerInstance = any;

interface Player {
    userId: string;
    displayName: string;
    connectionId: string;
    isEliminated?: boolean;
}

interface RoomState {
    hostId: string;
    players: Record<string, Player>;
}

export default function RoomPage() {
    const params = useParams();
    const roomId = params.roomId as string;
    const [connection, setConnection] = useState<HubConnection | null>(null);

    // Tự động cập nhật Trạng thái Presence là In-Match khi bắt đầu vào Game
    useEffect(() => {
        const myId = localStorage.getItem("userId");
        if (!myId) return;

        const presenceRef = ref(realtimeDb, `presence/${myId}`);
        set(presenceRef, {
            status: "In-Match",
            lastSeen: Date.now()
        }).catch(console.error);

        return () => {
            // Khi thoát trận đấu, trả lại trạng thái Online
            set(presenceRef, {
                status: "Online",
                lastSeen: Date.now()
            }).catch(console.error);
        };
    }, []);

    // =========================
    // Trạng thái ván đấu & Mật danh
    // =========================
    const [mySecret, setMySecret] = useState<{ role: string; word: string } | null>(null);
    const [isWordVisible, setIsWordVisible] = useState<boolean>(false); // Ẩn/Hiện từ tránh nhìn trộm

    // =========================
    // Voice Chat States
    // =========================
    const [isMicOn, setIsMicOn] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [isJoinedVoice, setIsJoinedVoice] = useState(false);

    const userStream = useRef<MediaStream | null>(null);
    const peers = useRef<Record<string, PeerInstance>>({});
    const remoteAudios = useRef<Record<string, HTMLAudioElement>>({});

    // =========================
    // Room / Player States
    // =========================
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const [currentUser, setCurrentUser] = useState<string>("")
    const [isChatOpen, setIsChatOpen] = useState(false);

    // =========================
    // 1. Hàm khởi tạo Peer (WebRTC)
    // =========================
    const createPeer = async (targetId: string, conn: HubConnection, initiator: boolean) => {
        const Peer = (await import('simple-peer')).default;
        
        const peer = new Peer({
            initiator: initiator,
            trickle: false,
            stream: userStream.current || undefined,
        });

        peer.on('signal', async (data: any) => {
            await conn.invoke('SendVoiceSignal', targetId, JSON.stringify(data));
        });

        peer.on('stream', (stream: MediaStream) => {
            let audio = document.getElementById(`audio-${targetId}`) as HTMLAudioElement;
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${targetId}`;
                audio.autoplay = true;
                document.body.appendChild(audio);
                remoteAudios.current[targetId] = audio;
            }
            audio.srcObject = stream;
            audio.muted = !isSpeakerOn;
        });

        peer.on('connect', () => console.log(`✅ Kết nối P2P thành công tới: ${targetId}`));
        
        peer.on('error', (err: any) => {
            console.error('Peer error:', err);
            cleanupPeer(targetId);
        });

        peer.on('close', () => cleanupPeer(targetId));

        return peer;
    };

    const cleanupPeer = (id: string) => {
        if (peers.current[id]) {
            peers.current[id].destroy();
            delete peers.current[id];
        }
        if (remoteAudios.current[id]) {
            remoteAudios.current[id].remove();
            delete remoteAudios.current[id];
        }
    };

    // =========================
    // 2. Hàm Join Voice (Tự động)
    // =========================
    const joinVoiceChat = async (activeConn: HubConnection) => {
        try {
            if (!userStream.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getAudioTracks().forEach(t => t.enabled = false);
                userStream.current = stream;
            }

            await activeConn.invoke("StartVoiceChat", roomId);
            setIsJoinedVoice(true);
            console.log("🚀 Auto-joined Voice Chat");
        } catch (err) {
            console.error("❌ Mic access denied:", err);
        }
    };

    // =========================
    // 3. Khởi tạo SignalR & Events
    // =========================
    useEffect(() => {
        let isMounted = true;

        // 1. Khởi tạo kết nối với Factory Token động
        const newConn = new HubConnectionBuilder()
            .withUrl(`${API_URL}/gamehub`, {
                // Luôn lấy token mới nhất từ localStorage mỗi khi kết nối hoặc reconnect
                accessTokenFactory: () => localStorage.getItem('token') || ""
            })
            .withAutomaticReconnect()
            .build();

        // 2. ĐĂNG KÝ SỰ KIỆN TRƯỚC KHI START
        // Lắng nghe xác nhận đã vào phòng thành công
        newConn.on("RoomJoined", (room: RoomState) => {
            console.log("✅ Đã xác nhận vào phòng:", room);
            setRoomState(room);
            // Sau khi xác nhận đã ở trong Group, ép lấy lại state một lần nữa cho chắc
            newConn.invoke("GetRoomState", roomId).catch(console.error);
        });

        newConn.on('UserJoinedVoice', async (newcomerId: string) => {
            if (!peers.current[newcomerId]) {
                const peer = await createPeer(newcomerId, newConn, true);
                peers.current[newcomerId] = peer;
            }
        });

        // Sự kiện: Nhận signal để bắt tay P2P
        newConn.on('ReceiveSignal', async (senderId: string, signal: string) => {
            let peer = peers.current[senderId];
            if (!peer) {
                peer = await createPeer(senderId, newConn, false);
                peers.current[senderId] = peer;
            }
            peer.signal(JSON.parse(signal));
        });

        newConn.on('PlayerDisconnected', (id: string) => cleanupPeer(id));

        newConn.on('RoomUpdated', (room: RoomState) => {
            console.log("Dữ liệu phòng đã cập nhật:", room.players);
            setRoomState(room);
    
            const myId = localStorage.getItem('userId');
    
            const players = Object.values(room.players || {});
    
            const me = players.find(
                (p: any) => p.userId === myId
            ) as any;
    
            if (me?.displayName) {
                setCurrentUser(me.displayName);
            }
        });

        // Sự kiện: Nhận từ khóa mật danh riêng tư từ Server
        newConn.on("ReceiveSecretWord", (data: { role: string; word: string }) => {
            setMySecret(data);
            setIsWordVisible(false); // Mặc định ẩn đi khi sang ván mới để an toàn
        });

        // Sự kiện: Cả phòng bắt đầu ván mới công khai
        newConn.on("RoundStarted", (room: RoomState) => {
            console.log("🎮 Ván đấu mới bắt đầu!");
            setRoomState(room);
        });

        const start = async () => {
            // Chỉ chạy nếu đang ở trạng thái Disconnected
            if (newConn.state === HubConnectionState.Disconnected) {
                try {
                    await newConn.start();
                    if (isMounted) {
                        setConnection(newConn);
                        
                        // QUAN TRỌNG: Phải JoinRoom XONG mới được làm những việc khác
                        await newConn.invoke("JoinRoom", roomId);
                        console.log("✅ Đã vào phòng thành công");

                        await newConn.invoke("GetRoomState", roomId); 
                        console.log("✅ Đã yêu cầu GetRoomState");
            
                        // Đợi 1 chút ngắn (500ms) để SignalR ổn định group trước khi bật Voice
                        setTimeout(async () => {
                            await joinVoiceChat(newConn);
                        }, 500);
                    }
        
                } catch (err: any) {
                    // KIỂM TRA LỖI Ở ĐÂY
                    if (err.name === 'AbortError' || err.message.includes("stopped during negotiation")) {
                        // Đây là lỗi do React Strict Mode hoặc F5 nhanh, có thể bỏ qua
                        console.warn("⚠️ SignalR: Kết nối bị hủy trong lúc khởi tạo (Abort), đang thử lại...");
                    } else if (isMounted) {
                        console.error("❌ SignalR Connection Error thực sự:", err);
                    }
                }
            }
        };

        start();

        return () => {
            isMounted = false;
            if (newConn.state === HubConnectionState.Connected) {
                newConn.stop(); // Dừng kết nối cũ để không bị tốn tài nguyên
            }
            userStream.current?.getTracks().forEach(t => t.stop());
        };
    }, [roomId]);

    // =========================
    // 4. Các hàm điều khiển
    // =========================
    const toggleMic = () => {
        if (userStream.current) {
            const newState = !isMicOn;
            userStream.current.getAudioTracks().forEach(t => t.enabled = newState);
            setIsMicOn(newState);
        }
    };

    const toggleSpeaker = () => {
        const newState = !isSpeakerOn;
        setIsSpeakerOn(newState);
        Object.values(remoteAudios.current).forEach(audio => audio.muted = !newState);
    };

    // =========================
    // RENDER UI
    // =========================
    const players = roomState ? Object.values(roomState.players) : [];
    const currentPlayerCount = players.length; // Thêm dòng này ở đây

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4 pt-20 relative">

            {/* TỪ KHÓA & ĐIỀU KHIỂN TRẬN ĐẤU */}
            <div className="mb-10 text-center flex flex-col items-center gap-4">
                <p className="text-gray-500 text-xs uppercase tracking-[0.3em]">
                    Mật danh của bạn
                </p>

                {/* Ô hiển thị mật danh - Click để Ẩn/Hiện */}
                <div 
                    onClick={() => mySecret && setIsWordVisible(!isWordVisible)}
                    className="bg-black/50 border-2 border-yellow-600/30 px-8 py-3 rounded-full text-white font-black text-xl tracking-widest shadow-[0_0_15px_rgba(230,168,34,0.1)] cursor-pointer select-none min-w-[200px] transition-all hover:bg-black/70"
                >
                    {mySecret ? (
                        isWordVisible ? (
                            <span className="text-yellow-400 text-2xl tracking-normal animate-pulse">
                                {mySecret.word}
                            </span>
                        ) : (
                            <span className="text-gray-600 blur-sm">•••••••• (Bấm xem)</span>
                        )
                    ) : (
                        <span className="text-gray-500 italic text-base tracking-normal">Chờ chủ phòng bắt đầu...</span>
                    )}
                </div>

                {/* NÚT BẮT ĐẦU VÁN MỚI (Chỉ hiển thị cho Host của phòng) */}
                {roomState?.hostId === localStorage.getItem('userId') && connection && (
                    <button
                        onClick={async () => {
                            try {
                                await connection.invoke("StartGame");
                                console.log("Đã phát lệnh khởi chạy ván đấu mới");
                            } catch (err) {
                                console.error("Lỗi khi bắt đầu ván đấu:", err);
                            }
                        }}
                        className="mt-2 bg-yellow-600 hover:bg-yellow-500 active:scale-95 text-black font-bold px-6 py-2 rounded-xl text-sm transition-all shadow-lg uppercase tracking-wider"
                    >
                        {mySecret ? "🔄 Ván tiếp theo" : "🚀 Bắt đầu ván đầu"}
                    </button>
                )}
            </div>

            {/* GRID NGƯỜI CHƠI */}
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
                        {player.userId === roomState?.hostId && (
                            <div className="absolute top-2 right-2 text-yellow-500">
                                <Shield size={14} fill="currentColor" />
                            </div>
                        )}

                        <h3 className="font-bold text-white truncate w-full">
                            {player.displayName}

                            {player.userId === localStorage.getItem('userId') && (
                                <span className="block text-[10px] text-yellow-500 mt-1 uppercase tracking-tighter">
                                    (Bạn)
                                </span>
                            )}
                        </h3>
                    </div>
                ))}
            </div>

            {/* THANH ĐIỀU KHIỂN - ĐÃ ĐƯA VỀ GÓC PHẢI */}
            {isJoinedVoice?(
                    <div className="fixed bottom-6 right-6 flex items-center gap-4 z-50">
                        {/* Cụm nút Mic/Loa */}
                        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/10 shadow-xl">
                            <button onClick={toggleSpeaker} className={`w-12 h-12 rounded-full flex items-center justify-center ${isSpeakerOn ? 'bg-green-600' : 'bg-gray-600'} text-white text-xl`}>
                                {isSpeakerOn ? '🔊' : '🔇'}
                            </button>
                            <button onClick={toggleMic} className={`w-12 h-12 rounded-full flex items-center justify-center ${isMicOn ? 'bg-blue-600' : 'bg-red-600'} text-white text-xl`}>
                                {isMicOn ? '🎙️' : '🚫'}
                            </button>
                        </div>

                        {/* Nút mở Chat */}
                        <button 
                            onClick={() => setIsChatOpen(!isChatOpen)} 
                            className="bg-yellow-600 text-black w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-2xl hover:scale-110 transition-all z-50"
                        >
                            {isChatOpen ? '✖' : '💬'}
                        </button>
                    </div>
                ):(
                    <div className="text-xs text-gray-500 animate-pulse bg-black/20 p-3 rounded-full">
                        🎤 Đang kết nối voice...
                    </div>
                )}
            
            {/* CHAT BOX - Sửa lại cách hiển thị để không mất lịch sử */}
            <div className={`fixed bottom-28 right-6 w-80 sm:w-96 h-[500px] z-50 ${isChatOpen ? 'block' : 'hidden'}`}>
                {connection && (
                    <ChatBox 
                        connection={connection} 
                        roomId={roomId} 
                        // Truyền userId thay vì displayName để ChatBox phân biệt Ta/Người
                        currentUser={ currentUser || localStorage.getItem("username") || "Người chơi" }
                        playerCount={currentPlayerCount}
                    />
                )}
            </div>
        </div>
    );
}