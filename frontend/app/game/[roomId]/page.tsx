"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {HubConnection, HubConnectionBuilder, HubConnectionState} from '@microsoft/signalr';
import { Shield } from 'lucide-react';
import ChatBox from '@/components/ChatBox';

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
    // Chat / Room States
    // =========================
    const [roomState, setRoomState] = useState<RoomState | null>(null);

    const [currentUser, setCurrentUser] = useState<string>(
        typeof window !== 'undefined'
            ? (localStorage.getItem("username") || "Người chơi")
            : "Đang tải..."
    );

    const [isChatOpen, setIsChatOpen] = useState(false);

    const roomStateRef = useRef<RoomState | null>(null);
    const speakerStateRef = useRef<boolean>(true);

    const connectionRef = useRef<HubConnection | null>(null);
    const isProcessing = useRef(false);

    useEffect(() => {
        roomStateRef.current = roomState;
    }, [roomState]);

    useEffect(() => {
        speakerStateRef.current = isSpeakerOn;

        Object.values(remoteAudios.current).forEach(audio => {
            audio.muted = !isSpeakerOn;
        });
    }, [isSpeakerOn]);

    // =========================
    // Peer Helpers
    // =========================
    const cleanupPeer = (id: string) => {
        try {
            peers.current[id]?.destroy();
        } catch {}

        delete peers.current[id];

        const audio = remoteAudios.current[id];

        if (audio) {
            audio.pause();
            audio.srcObject = null;
            audio.remove();
            delete remoteAudios.current[id];
        }
    };

    const cleanupAllPeers = () => {
        Object.keys(peers.current).forEach(id => {
            cleanupPeer(id);
        });
    };

    const stopLocalStream = () => {
        if (userStream.current) {
            userStream.current.getTracks().forEach(track => track.stop());
            userStream.current = null;
        }
    };

    // =========================
    // Create Peer
    // =========================
    const createPeer = async (
        targetConnectionId: string,
        hubConn: HubConnection,
        initiator: boolean
    ) => {
        const Peer = (await import('simple-peer')).default;

        const peer = new Peer({
            initiator,
            trickle: false,
            stream: userStream.current!
        });

        peer.on('signal', async (data: any) => {
            try {
                console.log('📡 Đã tạo tín hiệu kết nối:', data.type);

                await hubConn.invoke(
                    'SendVoiceSignal',
                    targetConnectionId,
                    JSON.stringify(data)
                );
            } catch (err) {
                console.error('Signal send failed:', err);
            }
        });

        peer.on('connect', () => {
            const targetPlayer = Object.values(
                roomStateRef.current?.players || {}
            ).find(
                (p: any) => p.connectionId === targetConnectionId
            ) as any;

            const targetName = targetPlayer
                ? targetPlayer.displayName
                : targetConnectionId;

            console.log(`✅ KẾT NỐI P2P THÀNH CÔNG tới: ${targetName}`);
        });

        peer.on('stream', (remoteStream: MediaStream) => {
            if (remoteAudios.current[targetConnectionId]) {
                return;
            }

            const audio = document.createElement('audio');

            audio.srcObject = remoteStream;
            audio.autoplay = true;
            audio.muted = !speakerStateRef.current;

            document.body.appendChild(audio);

            remoteAudios.current[targetConnectionId] = audio;
        });

        peer.on('close', () => {
            cleanupPeer(targetConnectionId);
        });

        peer.on('error', (err: any) => {
            console.error('Peer error:', err);
            cleanupPeer(targetConnectionId);
        });

        return peer;
    };

    // =========================
    // Join Voice
    // =========================
    const joinVoiceChat = async () => {
        if (isJoinedVoice) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            stream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });

            userStream.current = stream;

            setIsMicOn(false);
            setIsSpeakerOn(true);

            if (connection) {
                await connection.invoke('StartVoiceChat', roomId);

                const players = Object.values(
                    roomStateRef.current?.players || {}
                );

                const myId = localStorage.getItem('userId');

                for (const player of players as any[]) {
                    if (player.userId === myId) {
                        console.log('⏭️ Bỏ qua chính mình:', player.displayName);
                        continue;
                    }

                    if (!player.connectionId) continue;

                    if (peers.current[player.connectionId]) continue;

                    console.log(
                        `📤 Đang gửi lời mời kết nối tới: ${player.displayName} (${player.connectionId})`
                    );

                    const peer = await createPeer(
                        player.connectionId,
                        connection,
                        true
                    );

                    peers.current[player.connectionId] = peer;
                }
            }

            setIsJoinedVoice(true);
            console.log('☎️ Đã kết nối đường truyền Voice');
        } catch (err) {
            console.error(err);
            alert('Không thể kết nối Voice: Hãy cấp quyền Mic!');
        }
    };

    // =========================
    // Leave Voice
    // =========================
    const leaveVoiceChat = () => {
        cleanupAllPeers();
        stopLocalStream();

        setIsJoinedVoice(false);
        setIsMicOn(false);
        setIsSpeakerOn(false);

        console.log('🔌 Đã ngắt kết nối Voice hoàn toàn và dọn dẹp tài nguyên.');
    };

    // =========================
    // Toggle Mic
    // =========================
    const toggleMic = () => {
        const nextStatus = !isMicOn;

        setIsMicOn(nextStatus);

        if (userStream.current) {
            userStream.current.getAudioTracks().forEach(track => {
                track.enabled = nextStatus;
            });
        }
    };

    // =========================
    // Toggle Speaker
    // =========================
    const toggleSpeaker = () => {
        setIsSpeakerOn(prev => !prev);
    };

    // =========================
    // SignalR Init
    // =========================
    useEffect(() => {
        const token = typeof window !== 'undefined'
            ? localStorage.getItem('token')
            : null;

        if (!token) {
            console.error('Không tìm thấy Token!');
            return;
        }

        if (isProcessing.current) return;
        isProcessing.current = true;

        const conn = new HubConnectionBuilder()
            .withUrl('http://localhost:5120/gamehub', {
                accessTokenFactory: () => localStorage.getItem('token') || ''
            })
            .withAutomaticReconnect()
            .build();

        connectionRef.current = conn;

        const startConnection = async () => {
            try {
                if (conn.state === HubConnectionState.Disconnected) {
                    await conn.start();

                    await conn.invoke('JoinRoom', roomId);
                    await conn.invoke('GetRoomState', roomId);

                    setConnection(conn);

                    console.log('✅ SignalR Connected');
                }
            } catch (err: any) {
                console.error('Lỗi kết nối lại:', err);
            }
        };

        // =========================
        // Room Update
        // =========================
        conn.on('RoomUpdated', (room: RoomState) => {
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

        // =========================
        // Receive WebRTC Signal
        // =========================
        conn.on(
            'ReceiveSignal',
            async (senderId: string, signal: string) => {
                try {
                    if (!userStream.current) {
                        console.warn(
                            'Received signal before local stream ready'
                        );
                        return;
                    }

                    let peer = peers.current[senderId];

                    if (!peer) {
                        peer = await createPeer(senderId, conn, false);
                        peers.current[senderId] = peer;
                    }

                    if (peer.destroyed) return;

                    peer.signal(JSON.parse(signal));
                } catch (err) {
                    console.warn(
                        'Bỏ qua tín hiệu WebRTC trùng lặp hoặc lỗi từ:',
                        senderId
                    );
                }
            }
        );

        // =========================
        // Receive Voice Offer
        // =========================
        conn.on('ReceiveVoiceOffer', async (senderId: string) => {
            console.log('📞 Nhận được lời mời Voice Chat từ:', senderId);

            if (peers.current[senderId]) return;

            const peer = await createPeer(senderId, conn, false);
            peers.current[senderId] = peer;
        });

        // =========================
        // Disconnect Cleanup
        // =========================
        conn.on('PlayerDisconnected', (id: string) => {
            cleanupPeer(id);
        });

        conn.onclose(() => {
            leaveVoiceChat();
        });

        startConnection();

        return () => {
            isProcessing.current = false;

            leaveVoiceChat();

            if (connectionRef.current) {
                connectionRef.current.stop();
                connectionRef.current = null;
            }
        };
    }, [roomId]);

    // =========================
    // Cleanup Tab Close
    // =========================
    useEffect(() => {
        const cleanup = () => {
            leaveVoiceChat();
        };

        window.addEventListener('beforeunload', cleanup);

        return () => {
            window.removeEventListener('beforeunload', cleanup);
        };
    }, []);

    if (!roomState) {
        return (
            <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-yellow-600 italic">
                Đang tải dữ liệu trận đấu...
            </div>
        );
    }

    const players = Object.values(roomState.players || {}) as any[];

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center p-4 pt-20 relative">

            {/* TỪ KHÓA */}
            <div className="mb-10 text-center">
                <p className="text-gray-500 text-xs uppercase tracking-[0.3em] mb-2">
                    Mật danh hiện tại
                </p>

                <div className="bg-black/50 border-2 border-yellow-600/30 px-8 py-2 rounded-full text-white font-black text-xl tracking-widest shadow-[0_0_15px_rgba(230,168,34,0.1)]">
                    ********
                </div>
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
                        {player.userId === roomState.hostId && (
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

            {/* VOICE + CHAT CONTROLS */}
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">

                <div className="flex gap-3 items-center mr-2">
                    {!isJoinedVoice ? (
                        <button
                            onClick={joinVoiceChat}
                            className="bg-green-600 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-green-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <span className="text-lg">📞</span>
                            Kết nối Voice
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={toggleSpeaker}
                                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
                                    isSpeakerOn
                                        ? 'bg-green-600'
                                        : 'bg-gray-600'
                                } text-white`}
                                title={isSpeakerOn ? 'Tắt Loa' : 'Bật Loa'}
                            >
                                {isSpeakerOn ? '🔊' : '🔇'}
                            </button>

                            <button
                                onClick={toggleMic}
                                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
                                    isMicOn
                                        ? 'bg-blue-600'
                                        : 'bg-red-600'
                                } text-white`}
                                title={isMicOn ? 'Mute Mic' : 'Unmute Mic'}
                            >
                                {isMicOn ? '🎙️' : '🚫'}
                            </button>

                            <button
                                onClick={leaveVoiceChat}
                                className="w-12 h-12 rounded-full bg-black/60 border border-white/20 text-white hover:bg-red-900 transition-all"
                                title="Ngắt kết nối Voice"
                            >
                                ✖
                            </button>
                        </>
                    )}
                </div>

                {/* CHAT BUTTON */}
                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    className="bg-yellow-600 text-black w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-50"
                >
                    {isChatOpen ? '✖' : '💬'}
                </button>
            </div>

            {/* CHAT BOX */}
            <div
                className={`fixed bottom-24 right-6 z-50 w-80 sm:w-96 transition-all duration-300 transform ${
                    isChatOpen
                        ? 'scale-100 opacity-100 translate-y-0'
                        : 'scale-95 opacity-0 translate-y-10 pointer-events-none'
                }`}
            >
                {connection && (
                    <ChatBox
                        connection={connection}
                        roomId={roomId}
                        currentUser={currentUser}
                    />
                )}
            </div>
        </div>
    );
}