"use client";
const getLS = () => typeof window !== 'undefined' ? (window as any).sessionStorage : null;

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    HubConnection,
    HubConnectionBuilder,
    HubConnectionState
} from '@microsoft/signalr';
import { Shield, MessageSquare, Settings, Clock, Vote, Eye, EyeOff, ChevronUp, ChevronDown, CheckCircle2, LogOut, Key, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import RoleRevealingScreen from '@/components/game/RoleRevealingScreen';
import DescribingPhase from '@/components/game/DescribingPhase';
import LoadingPhaseScreen from '@/components/game/LoadingPhaseScreen';
import VotingGrid from '@/components/game/VotingGrid';
import RoundTransitionScreen from '@/components/game/RoundTransitionScreen';
import GameEndedScreen from '@/components/game/GameEndedScreen';
import WhiteHatGuessOverlay from '@/components/game/WhiteHatGuessOverlay';
import { ref, set } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';
import { API_URL, getToken } from '@/lib/auth';
import { useGameSound } from "@/hooks/useGameSound";
import SettingsModal from "@/components/SettingsModal";
import { getVoiceOutputVolume, subscribeSound } from "@/lib/soundSettings";

type PeerInstance = any;

// ================================
// Types
// ================================
interface Player {
    userId: string;
    displayName: string;
    connectionId: string;
    avatar?: string;
    isReady?: boolean;
    isEliminated?: boolean;
    role?: string;
    descriptionHistory?: string[];
}

import { getSignalRConnection } from "@/lib/signalRConnection";
interface RoomState {
    hostId: string;
    players: Record<string, Player>;
    settings?: any;
}

type GamePhase =
    | 'lobby'
    | 'roleRevealing'
    | 'loading'
    | 'describing'
    | 'voting'
    | 'roundTransition'
    | 'gameEnded';

interface VoteCounts { [userId: string]: number }

interface RoundTransitionData {
    roundNumber: number;
    isTieVote: boolean;
    eliminatedPlayerName?: string | null;
    eliminatedPlayerRole?: string | null;
    alivePlayers: { userId: string; displayName: string }[];
    countdownDuration: number;
}

interface GameEndedData {
    winner: string;
    civilianWord?: string;
    players: { userId: string; displayName: string; role: string; isEliminated: boolean }[];
}

interface LoadingSyncState {
    readyCount: number;
    totalCount: number;
    readyPlayerIds: string[];
    timeoutSeconds: number;
    startedAt: number;
    secondsLeft: number;
    isMeReady: boolean;
    isSpectator: boolean;
    spectatorReason?: string;
    spectatorIds: string[];
    activePlayerIds: string[];
}

const GAME_BACKGROUNDS = ['/bg1.jpg', '/bg2.jpg', '/bg3.jpg', '/bg4.jpg'];

// ================================
// Notification toast
// ================================
function Notification({ messages }: { messages: { id: string; type: 'info' | 'warning' | 'result' | 'error'; text: string }[] }) {
    const typeStyle = {
        info: { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.3)", color: "#818cf8", prefix: "ℹ️" },
        warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#fbbf24", prefix: "⚠️" },
        result: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#f87171", prefix: "📢" },
        error: { bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.4)", color: "#ef4444", prefix: "❌" },
    };
    if (messages.length === 0) return null;
    return (
        <div style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            zIndex: 999, display: "flex", flexDirection: "column", gap: 6,
            maxWidth: 400, width: "90%",
        }}>
            {messages.map(msg => {
                const s = typeStyle[msg.type];
                return (
                    <div key={msg.id} style={{
                        background: s.bg, border: `1px solid ${s.border}`,
                        borderRadius: 12, padding: "10px 16px",
                        color: s.color, fontSize: 13, fontWeight: 600,
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                        animation: "notif-in 0.3s ease",
                    }}>
                        {s.prefix} {msg.text}
                    </div>
                );
            })}
            <style>{`
                @keyframes notif-in {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

// ================================
// Main component
// ================================
export default function GameRoomPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = params.roomId as string;
    
    const gameSounds = useGameSound();
    const { playClick, playStart, playReady, playAlert, stopBGM, playGameBGM, stopGameBGM, playLose, playWin } = gameSounds;
    const gameSoundsRef = useRef(gameSounds);

    useEffect(() => {
        gameSoundsRef.current = gameSounds;
    }, [gameSounds]);

    // Dừng nhạc nền Pink Panther khi vào phòng chơi game
    useEffect(() => {
        stopBGM();
        playGameBGM(); // Bắt đầu nhạc game
        return () => {
            stopGameBGM(); // Dừng nhạc game khi component bị unmount
        };
    }, [stopBGM, playGameBGM, stopGameBGM]);

    const [connection, setConnection] = useState<HubConnection | null>(null);

    // Tự động cập nhật Trạng thái Presence là In-Match khi bắt đầu vào Game
    useEffect(() => {
        const myId = sessionStorage.getItem("userId");
        if (!myId) return;

        const presenceRef = ref(realtimeDb, `presence/${myId}`);
        set(presenceRef, {
            status: "In-Match",
            lastSeen: Date.now()
        }).catch(console.error);

        return () => {
            // Khi thoát trận đấu, SessionGuard sẽ tự xử lý chuyển trạng thái (In-Room hoặc Online)
        };
    }, []);

    // ── Secret & Phase ──────────────────────
    const [mySecret, setMySecret] = useState<{ role: string; word: string } | null>(null);
    const [gamePhase, setGamePhase] = useState<GamePhase>('lobby');
    const [isWaitingForTurnOrder, setIsWaitingForTurnOrder] = useState(false);

    const [loadingSync, setLoadingSync] = useState<LoadingSyncState | null>(null);

    // ── Turn / Describing ───────────────────
    const [turnOrder, setTurnOrder] = useState<string[]>([]);
    const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
    const [roundNumber, setRoundNumber] = useState(1);
    const [turnEndTime, setTurnEndTime] = useState<number | undefined>(undefined);
    const [describeDuration, setDescribeDuration] = useState(30);
    const [typingSync, setTypingSync] = useState<Record<string, { text: string; isFinal: boolean }>>({});

    // ── Voting ──────────────────────────────
    const [voteEndTime, setVoteEndTime] = useState(Date.now() + 60000);
    const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
    const [realtimeVotes, setRealtimeVotes] = useState<Record<string, string>>({});
    const [totalVotesCast, setTotalVotesCast] = useState<number>(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [myVoteTarget, setMyVoteTarget] = useState<string | null>(null);
    const [extendVoteCount, setExtendVoteCount] = useState(0);
    const [extendRequiredCount, setExtendRequiredCount] = useState(0);
    const [hasRequestedExtend, setHasRequestedExtend] = useState(false);
    const [isTimeExtended, setIsTimeExtended] = useState(false);
    const [hasSkippedVote, setHasSkippedVote] = useState(false);
    const [skipVoteCount, setSkipVoteCount] = useState(0);
    const [skipRequiredCount, setSkipRequiredCount] = useState(0);

    // ── Round Transition ────────────────────
    const [transitionData, setTransitionData] = useState<RoundTransitionData | null>(null);

    // ── Game Ended ──────────────────────────
    const [gameEndedData, setGameEndedData] = useState<GameEndedData | null>(null);

    // ── White Hat ───────────────────────────
    const [showWhiteHatGuess, setShowWhiteHatGuess] = useState(false);
    const [whiteHatTimeLeft, setWhiteHatTimeLeft] = useState(20);
    const [whiteHatInfo, setWhiteHatInfo] = useState<{ userId: string, displayName: string } | null>(null);
    const [pendingWinner, setPendingWinner] = useState<string | null>(null);

    // ── Voice ────────────────────────────────
    const [isMicOn, setIsMicOn] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [isJoinedVoice, setIsJoinedVoice] = useState(false);
    const userStream = useRef<MediaStream | null>(null);
    const peers = useRef<Record<string, PeerInstance>>({});
    const remoteAudios = useRef<Record<string, HTMLAudioElement>>({});
    const peerCtorRef = useRef<any>(null); // simple-peer constructor (preload để tạo peer đồng bộ, tránh race)
    const myVoiceId = useRef<string>(''); // connectionId của CHÍNH MÌNH do server báo về (dùng so sánh chọn initiator)
    const joinedVoiceRef = useRef<boolean>(false); // chống gọi joinVoiceChat 2 lần

    // ── Room / UI ───────────────────────────
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const roomStateRef = useRef<RoomState | null>(null);
    const [currentUser, setCurrentUser] = useState<string>("");
    const [currentUserId, setCurrentUserId] = useState<string>("");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Lắng nghe thay đổi âm lượng voice output
    useEffect(() => {
        const updateVoiceVols = () => {
            const vol = getVoiceOutputVolume();
            Object.values(remoteAudios.current).forEach(audio => {
                audio.volume = vol;
            });
        };
        // Áp dụng ngay khi mount
        updateVoiceVols();
        // Lắng nghe thay đổi từ SettingsModal
        return subscribeSound(updateVoiceVols);
    }, []);

    // ── Settings ────────────────────────────
    const [showSettings, setShowSettings] = useState(false);
    const [localSettings, setLocalSettings] = useState<any>({
        describeDuration: 30,
        voteDuration: 60,
        revealEliminatedRole: true,
        roundTransitionDuration: 5,
    });

    // ── Notifications ───────────────────────
    const [notifications, setNotifications] = useState<{ id: string; type: 'info' | 'warning' | 'result' | 'error'; text: string }[]>([]);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const addNotif = (text: string, type: 'info' | 'warning' | 'result' | 'error' = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setNotifications(prev => [...prev.slice(-3), { id, type, text }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    };

    // ================================
    // WebRTC helpers
    // ================================
    // Tạo peer ĐỒNG BỘ (constructor đã được preload trong joinVoiceChat) -> không còn await -> tránh race tạo trùng peer
    const createPeer = (targetId: string, conn: HubConnection, initiator: boolean): PeerInstance | null => {
        const Peer = peerCtorRef.current;
        if (!Peer) { console.warn('[VOICE] simple-peer chưa sẵn sàng'); return null; }
        const hasStream = !!userStream.current;
        console.log(`[VOICE] createPeer -> ${targetId} | initiator=${initiator} | có mic stream=${hasStream}`);
        const peer = new Peer({
            initiator,
            trickle: false,
            stream: userStream.current || undefined,
            config: {
                iceServers: [
                    // STUN: giúp tìm IP công khai (đủ cho NAT thường)
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    // TURN: relay media khi P2P trực tiếp bị NAT/firewall chặn (BẮT BUỘC để chạy qua internet)
                    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                ],
            },
        });
        peer.on('signal', async (data: any) => {
            console.log(`[VOICE] gửi signal -> ${targetId} (${data?.type || 'candidate'})`);
            try { await conn.invoke('SendVoiceSignal', targetId, JSON.stringify(data)); }
            catch (e) { console.error('[VOICE] SendVoiceSignal lỗi:', e); }
        });
        peer.on('stream', (stream: MediaStream) => {
            console.log(`[VOICE] 🔊 NHẬN remote stream từ ${targetId} | tracks=${stream.getAudioTracks().length}`);
            let audio = document.getElementById(`audio-${targetId}`) as HTMLAudioElement;
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${targetId}`;
                audio.autoplay = true;
                (audio as any).playsInline = true;
                document.body.appendChild(audio);
                remoteAudios.current[targetId] = audio;
            }
            audio.srcObject = stream;
            audio.muted = !isSpeakerOn;
            audio.volume = getVoiceOutputVolume();
            audio.play()
                .then(() => console.log(`[VOICE] ▶️ đang phát audio của ${targetId}`))
                .catch(err => console.warn(`[VOICE] ⚠️ autoplay bị chặn (${targetId}):`, err?.name || err));
        });
        peer.on('connect', () => console.log(`[VOICE] ✅ P2P CONNECTED: ${targetId}`));
        peer.on('error', (err: any) => { console.error(`[VOICE] ❌ Peer error (${targetId}):`, err); cleanupPeer(targetId); });
        peer.on('close', () => { console.log(`[VOICE] đóng peer ${targetId}`); cleanupPeer(targetId); });
        return peer;
    };

    const cleanupPeer = (id: string) => {
        if (peers.current[id]) { peers.current[id].destroy(); delete peers.current[id]; }
        if (remoteAudios.current[id]) { remoteAudios.current[id].remove(); delete remoteAudios.current[id]; }
    };

    // Kết nối tới 1 peer khác. Quy tắc tất định: chỉ bên có connectionId LỚN HƠN làm initiator
    // -> mỗi cặp chỉ có 1 offer, tránh glare ("Failed to start SCTP transport").
    const connectToPeer = (otherId: string, conn: HubConnection) => {
        if (!otherId || peers.current[otherId]) {
            console.log(`[VOICE] bỏ qua connectToPeer ${otherId} (đã có peer hoặc rỗng)`);
            return;
        }
        // Ưu tiên id do server báo (myVoiceId), fallback connectionId của client
        const myId = myVoiceId.current || conn.connectionId || '';
        const initiator = myId > otherId;
        console.log(`[VOICE] connectToPeer ${otherId} | myId=${myId} | làm initiator=${initiator}`);
        const peer = createPeer(otherId, conn, initiator);
        if (peer) peers.current[otherId] = peer;
    };

    const joinVoiceChat = async (activeConn: HubConnection) => {
        if (joinedVoiceRef.current) { console.log('[VOICE] joinVoiceChat: đã vào rồi, bỏ qua'); return; }
        joinedVoiceRef.current = true;
        try {
            console.log('[VOICE] joinVoiceChat: bắt đầu...');
            // Preload constructor TRƯỚC khi vào voice -> mọi sự kiện signaling sau đó tạo peer đồng bộ
            if (!peerCtorRef.current) peerCtorRef.current = (await import('simple-peer')).default;
            if (!userStream.current) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,   // khử tiếng vọng (mic thu lại loa)
                        noiseSuppression: true,   // lọc ồn nền
                        autoGainControl: true,    // tự cân âm lượng
                    },
                });
                stream.getAudioTracks().forEach(t => t.enabled = false);
                userStream.current = stream;
                console.log(`[VOICE] đã lấy mic, số audio track=${stream.getAudioTracks().length} (đang tắt sẵn)`);
            }
            await activeConn.invoke("StartVoiceChat", roomId);
            setIsJoinedVoice(true);
            console.log(`[VOICE] đã StartVoiceChat, connectionId=${activeConn.connectionId}`);
        } catch (err) {
            joinedVoiceRef.current = false;
            console.error("[VOICE] ❌ Không vào được voice / mic bị từ chối:", err);
        }
    };

    // Rời voice: dọn sạch tất cả peer + tắt mic + báo server. Gọi khi chơi lại / về menu / unmount.
    const leaveVoice = (conn?: HubConnection | null) => {
        const c = conn || connection;
        try { c?.invoke("LeaveVoiceChat", roomId); } catch { /* ignore */ }
        Object.keys(peers.current).forEach(id => cleanupPeer(id));
        userStream.current?.getTracks().forEach(t => t.stop());
        userStream.current = null;
        joinedVoiceRef.current = false;
        myVoiceId.current = '';
        console.log('[VOICE] 🔌 rời voice: đã destroy peers + tắt mic + báo server');
    };

    // ================================
    // Controls
    // ================================
    const toggleMic = () => {
        if (!userStream.current) { console.warn('[VOICE] toggleMic: chưa có mic stream'); return; }
        const newState = !isMicOn;
        userStream.current.getAudioTracks().forEach(t => t.enabled = newState);
        setIsMicOn(newState);
        console.log(`[VOICE] 🎙️ Mic ${newState ? 'BẬT' : 'TẮT'} | số peer đang kết nối=${Object.keys(peers.current).length}`);
        // Tận dụng cú click (user gesture) để bỏ chặn autoplay cho audio đang nhận
        Object.values(remoteAudios.current).forEach(a => a.play().catch(() => {}));
    };

    const toggleSpeaker = () => {
        const newState = !isSpeakerOn;
        setIsSpeakerOn(newState);
        Object.values(remoteAudios.current).forEach(audio => {
            audio.muted = !newState;
            if (newState) audio.play().catch(() => {});
        });
        console.log(`[VOICE] 🔊 Loa ${newState ? 'BẬT' : 'TẮT'} | số audio remote=${Object.keys(remoteAudios.current).length}`);
    };

    const handleSkipTurn = async () => {
        if (!connection) return;
        try { await connection.invoke("SkipTurn"); }
        catch (e) { console.error("SkipTurn error:", e); }
    };

    const handleSubmitDescription = async (text: string, source: "typed" | "speech") => {
        if (!connection) return;
        try {
            await connection.invoke("SubmitDescription", text, source);
        } catch (e) {
            console.error("SubmitDescription error:", e);
        }
    };

    const handleVote = async (targetUserId: string) => {
        if (!connection || hasVoted) return;
        try {
            await connection.invoke("SubmitVote", targetUserId);
            setMyVoteTarget(targetUserId);
            setHasVoted(true);
        } catch (e) { console.error("Vote error:", e); }
    };

    const handleChangeVote = async (targetUserId: string) => {
        if (!connection) return;
        try {
            await connection.invoke("ChangeVote", targetUserId);
            setMyVoteTarget(targetUserId);
            setHasVoted(true);
        } catch (e) { console.error("ChangeVote error:", e); }
    };

    const handleRevokeVote = async () => {
        if (!connection) return;
        try {
            await connection.invoke("RevokeVote");
            setMyVoteTarget(null);
            setHasVoted(false);
        } catch (e) { console.error("RevokeVote error:", e); }
    };

    const handleSkipVoting = async () => {
        if (!connection) return;
        try { await connection.invoke("SkipVote"); }
        catch (e) { console.error("SkipVote error:", e); }
    };

    const handleExtendVote = async () => {
        if (!connection) return;
        try { await connection.invoke("ExtendVote"); }
        catch (e) { console.error("ExtendVote error:", e); }
    };

    const handleWhiteHatGuess = async (word: string) => {
        if (!connection) return;
        try { await connection.invoke("UseWhiteHatGuess", word); }
        catch (e) { console.error("WhiteHatGuess error:", e); }
        setShowWhiteHatGuess(false);
    };

    const handlePlayAgain = async () => {
        if (!connection) return;
        leaveVoice(connection); // dọn voice trước khi rời trang game
        try { await connection.invoke("BackToLobby"); }
        catch (e) { console.error("PlayAgain error:", e); }
        router.push(`/room/${roomId}`);
    };

    const handleUpdateSettings = async (newSettings: any) => {
        const merged = { ...localSettings, ...newSettings };
        setLocalSettings(merged);
        if (connection) {
            try { await connection.invoke("UpdateRoomSettings", merged); }
            catch (e) { }
        }
    };

    const handleLeaveRoom = async () => {
        setShowLeaveConfirm(false);
        if (!connection) return;

        leaveVoice(connection); // dọn voice trước khi về menu
        try {
            await connection.invoke("LeaveRoom");
        } catch (error) {
            console.error("LeaveRoom error:", error);
        }

        router.push("/menu");
    };

    const requestLeaveRoom = () => setShowLeaveConfirm(true);
    const cancelLeaveRoom = () => setShowLeaveConfirm(false);

    const leaveRoomButton = (
        <button
            onClick={requestLeaveRoom}
            style={{
                position: "fixed",
                top: 24,
                left: 24,
                zIndex: 1000,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
                color: "rgba(255,255,255,0.85)",
                borderRadius: 14,
                padding: "10px 20px",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(239,68,68,0.15)";
                e.currentTarget.style.border = "1px solid rgba(239,68,68,0.4)";
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(239,68,68,0.25)";
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
                e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.2)";
            }}
        >
            <LogOut size={16} /> RỜI PHÒNG
        </button>
    );

    const confirmLeaveOverlay = showLeaveConfirm ? (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.74)', zIndex: 2100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                width: 'min(560px,100%)', background: '#0d0d14', borderRadius: 24,
                boxShadow: '0 24px 70px rgba(0,0,0,0.7)', padding: '28px 26px', border: '1px solid rgba(255,255,255,0.06)',
                color: '#fff', textAlign: 'center', lineHeight: 1.6,
            }}>
                <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Xác nhận rời phòng</div>
                <div style={{ color: 'rgba(255,255,255,0.82)', marginBottom: 24, fontSize: 15 }}>
                    Bạn có chắc muốn rời phòng? Bạn sẽ mất kết nối với ván đấu hiện tại.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button
                        onClick={cancelLeaveRoom}
                        style={{
                            minWidth: 120, padding: '10px 16px', borderRadius: 12,
                            background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)',
                            cursor: 'pointer', fontWeight: 700,
                        }}
                    >Hủy</button>
                    <button
                        onClick={handleLeaveRoom}
                        style={{
                            minWidth: 120, padding: '10px 16px', borderRadius: 12,
                            background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
                        }}
                    >Rời phòng</button>
                </div>
            </div>
        </div>
    ) : null;

    const voiceControls = (
        <>
            {/* Thanh điều khiển cố định góc TRÊN PHẢI: Loa - Mic - Chat */}
            {isJoinedVoice ? (
                <div className="fixed top-6 right-6 z-[500] flex items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 px-3 py-2 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                    <button
                        onClick={toggleSpeaker}
                        title={isSpeakerOn ? "Tắt loa" : "Bật loa"}
                        className={`w-[42px] h-[42px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all ${
                            isSpeakerOn ? "bg-indigo-500/20 text-indigo-400" : "bg-white/5 text-white/30 hover:bg-white/10"
                        }`}
                    >
                        {isSpeakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                    <button
                        onClick={toggleMic}
                        title={isMicOn ? "Tắt mic" : "Bật mic"}
                        className={`w-[42px] h-[42px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all ${
                            isMicOn ? "bg-red-500/20 text-red-500" : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                        }`}
                    >
                        {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                    </button>
                    <button
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        title="Chat"
                        className={`w-[42px] h-[42px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all ${
                            isChatOpen ? "bg-[#e6a822] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"
                        }`}
                    >
                        <MessageSquare size={20} />
                    </button>
                    <button
                        onClick={() => setShowSettingsModal(true)}
                        title="Cài đặt"
                        className={`w-[42px] h-[42px] rounded-full border-none flex items-center justify-center cursor-pointer transition-all ${
                            showSettingsModal ? "bg-[#e6a822] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"
                        }`}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            ) : (
                <div className="fixed top-6 right-6 z-[500] bg-black/50 backdrop-blur-md rounded-full px-4 py-2 text-white/30 text-xs shadow-lg flex items-center gap-2 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-yellow-500/50"></span>
                    Đang kết nối voice...
                </div>
            )}

            {/* Chat box mở XUỐNG dưới thanh điều khiển */}
            <div className={`fixed top-24 right-6 w-[340px] z-[499] transition-all duration-300 ${isChatOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                {connection && (
                    <ChatBox
                        connection={connection}
                        roomId={roomId}
                        currentUser={currentUser || sessionStorage.getItem("username") || "Người chơi"}
                        playerCount={Object.keys(roomState?.players || {}).length}
                    />
                )}
            </div>
        </>
    );

    const overlayElements = (
        <>
            {confirmLeaveOverlay}
            {voiceControls}
            {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
        </>
    );

    const handleRoleRevealAdvance = useCallback(() => {
        if (connection?.state === HubConnectionState.Connected) {
            connection.invoke("PlayerReady").catch(error => {
                console.error("PlayerReady error:", error);
            });
        }
    }, [connection]);

    useEffect(() => {
        if (!isWaitingForTurnOrder) return;
        const timeout = window.setTimeout(() => {
            setGamePhase('describing');
            setIsWaitingForTurnOrder(false);
        }, 3000);
        return () => window.clearTimeout(timeout);
    }, [isWaitingForTurnOrder]);

    const preloadGameAssets = useCallback(async (imageUrl: string) => {
        if (typeof window === "undefined" || !imageUrl) return;
        // Chỉ preload ĐÚNG ảnh nền đang dùng (không tải cả 4 ảnh gây lag).
        await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = imageUrl;
        });
    }, []);

    // ================================
    // SignalR setup
    // ================================
    useEffect(() => {
        let isMounted = true;
        const storedUserId = getLS()?.getItem('userId') || '';
        setCurrentUserId(storedUserId);

        const newConn = getSignalRConnection(getToken() || "");

        // ── Room events ──────────────────────────
        newConn.on("RoomJoined", (room: RoomState) => {
            setRoomState(room);
            if (newConn.state === HubConnectionState.Connected) {
                newConn.invoke("GetRoomState", roomId).catch(console.error);
            }
        });

        newConn.on("RoomError", (message: string) => {
            addNotif(message, 'warning');
        });

        newConn.on("KickedFromRoom", (message: string) => {
            addNotif(message, 'warning');
            setTimeout(() => router.push("/menu"), 1200);
        });

        newConn.on("RoomUpdated", (room: RoomState) => {
            setRoomState(room);
            if ((room as any).settings) {
                const s = (room as any).settings;
                setLocalSettings({
                    describeDuration: s.describeDuration ?? 30,
                    voteDuration: s.voteDuration ?? 60,
                    revealEliminatedRole: s.revealEliminatedRole ?? true,
                    roundTransitionDuration: s.roundTransitionDuration ?? 5,
                });
            }
            const players = Object.values(room.players || {});
            const me = players.find((p: any) => p.userId === storedUserId) as any;
            if (me?.displayName) setCurrentUser(me.displayName);
        });

        // ── Voice events ─────────────────────────
        // Người mới nhận danh sách người đang trong voice -> kết nối tới từng người (tất định)
        newConn.on('ExistingVoiceUsers', (data: { selfId: string; users: string[] }) => {
            myVoiceId.current = data?.selfId || '';
            console.log('[VOICE] 📥 ExistingVoiceUsers | selfId=', data?.selfId, '| users=', data?.users);
            (data?.users || []).forEach(id => connectToPeer(id, newConn));
        });
        // Có người mới vào voice -> kết nối tới họ (tất định)
        newConn.on('UserJoinedVoice', (newcomerId: string) => {
            console.log('[VOICE] 📥 UserJoinedVoice:', newcomerId);
            connectToPeer(newcomerId, newConn);
        });
        newConn.on('ReceiveSignal', (senderId: string, signal: string) => {
            console.log(`[VOICE] 📥 ReceiveSignal từ ${senderId}`);
            let peer = peers.current[senderId];
            if (!peer) {
                // Chưa có peer -> mình là bên non-initiator, tạo để nhận offer
                console.log(`[VOICE] chưa có peer cho ${senderId} -> tạo non-initiator`);
                peer = createPeer(senderId, newConn, false);
                if (peer) peers.current[senderId] = peer;
            }
            if (peer) { try { peer.signal(JSON.parse(signal)); } catch (e) { console.error('[VOICE] signal lỗi:', e); } }
        });
        newConn.on('PlayerDisconnected', (id: string) => { console.log('[VOICE] 📥 PlayerDisconnected:', id); cleanupPeer(id); });
        newConn.on('PlayerDisconnected', (id: string) => cleanupPeer(id));
        newConn.on("PlayerLeft", (data: { userId: string, displayName: string }) => {
            addNotif(`${data.displayName} đã rời phòng.`, 'warning');
        });

        // ── Game phase events ────────────────────

        // 1. Nhận vai trò bí mật → chuyển sang phase roleRevealing
        newConn.on("ReceiveSecretWord", (data: { role: string; word: string }) => {
            setMySecret(data);
            setGamePhase('roleRevealing');
        });

        // Backward-compat with old event name
        newConn.on("RoleAssigned", (data: { role: string; word: string }) => {
            setMySecret(data);
            setGamePhase('roleRevealing');
        });

        newConn.on("ReturnedToLobby", () => {
            console.log("Phòng đã được reset. Bạn có thể tự bấm Chơi Lại.");
        });

        newConn.on("LoadingPhaseStarted", async (data: { timeoutSeconds?: number; totalCount?: number; startedAt?: number; readyCount?: number; readyPlayerIds?: string[] }) => {
            const timeoutSeconds = data.timeoutSeconds ?? 60;
            const startedAt = data.startedAt ?? Date.now();
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            const hash = roomId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
            const syncedBackground = GAME_BACKGROUNDS[hash % GAME_BACKGROUNDS.length];
            const totalPlayers = data.totalCount ?? Object.keys(roomStateRef.current?.players ?? {}).length;

            setLoadingSync({
                readyCount: data.readyCount ?? 0,
                totalCount: totalPlayers,
                readyPlayerIds: data.readyPlayerIds ?? [],
                timeoutSeconds,
                startedAt,
                secondsLeft: Math.max(0, timeoutSeconds - elapsed),
                isMeReady: Boolean(data.readyPlayerIds?.includes(storedUserId)),
                isSpectator: false,
                spectatorIds: [],
                activePlayerIds: [],
            });
            setGamePhase('loading');

            await preloadGameAssets(syncedBackground);

            try {
                await newConn.invoke("PlayerLoadingReady", roomId);
                setLoadingSync(prev => prev
                    ? {
                        ...prev,
                        isMeReady: true,
                        readyPlayerIds: prev.readyPlayerIds.includes(storedUserId)
                            ? prev.readyPlayerIds
                            : [...prev.readyPlayerIds, storedUserId],
                        readyCount: prev.readyPlayerIds.includes(storedUserId)
                            ? prev.readyCount
                            : Math.min(prev.totalCount || prev.readyCount + 1, prev.readyCount + 1),
                    }
                    : prev);
            } catch (e) {
                console.error("PlayerLoadingReady error:", e);
            }
        });

        newConn.on("LoadingProgressUpdated", (data: { readyCount: number; totalCount: number; readyPlayerIds?: string[] }) => {
            setLoadingSync(prev => ({
                readyCount: data.readyCount,
                totalCount: data.totalCount,
                readyPlayerIds: data.readyPlayerIds ?? prev?.readyPlayerIds ?? [],
                timeoutSeconds: prev?.timeoutSeconds ?? 60,
                startedAt: prev?.startedAt ?? Date.now(),
                secondsLeft: prev?.secondsLeft ?? 10,
                isMeReady: Boolean(data.readyPlayerIds?.includes(storedUserId)) || prev?.isMeReady || false,
                isSpectator: prev?.isSpectator ?? false,
                spectatorReason: prev?.spectatorReason,
                spectatorIds: prev?.spectatorIds ?? [],
                activePlayerIds: prev?.activePlayerIds ?? [],
            }));
        });

        newConn.on("SwitchedToSpectator", (data: { reason?: string; isSpectator?: boolean }) => {
            setLoadingSync(prev => ({
                readyCount: prev?.readyCount ?? 0,
                totalCount: prev?.totalCount ?? Object.keys(roomStateRef.current?.players ?? {}).length,
                readyPlayerIds: prev?.readyPlayerIds ?? [],
                timeoutSeconds: prev?.timeoutSeconds ?? 60,
                startedAt: prev?.startedAt ?? Date.now(),
                secondsLeft: prev?.secondsLeft ?? 0,
                isMeReady: prev?.isMeReady ?? false,
                isSpectator: data.isSpectator ?? true,
                spectatorReason: data.reason,
                spectatorIds: prev?.spectatorIds?.includes(storedUserId)
                    ? prev.spectatorIds
                    : [...(prev?.spectatorIds ?? []), storedUserId],
                activePlayerIds: prev?.activePlayerIds ?? [],
            }));
            addNotif(data.reason ?? "Kết nối của bạn hơi chậm. Bạn đang quan sát ván này.", 'warning');
        });

        newConn.on("SpectatorUpdated", (data: { spectatorIds?: string[]; activePlayerIds?: string[] }) => {
            setLoadingSync(prev => prev
                ? {
                    ...prev,
                    spectatorIds: data.spectatorIds ?? prev.spectatorIds,
                    activePlayerIds: data.activePlayerIds ?? prev.activePlayerIds,
                    isSpectator: data.spectatorIds?.includes(storedUserId) ?? prev.isSpectator,
                }
                : prev);
        });

        newConn.on("GameStarted", (data: { activePlayerIds?: string[]; spectatorIds?: string[] } | RoomState) => {
            const spectatorIds = "spectatorIds" in data ? data.spectatorIds ?? [] : [];
            setLoadingSync(prev => prev
                ? {
                    ...prev,
                    secondsLeft: 0,
                    spectatorIds,
                    activePlayerIds: "activePlayerIds" in data ? data.activePlayerIds ?? prev.activePlayerIds : prev.activePlayerIds,
                    isSpectator: spectatorIds.includes(storedUserId) || prev.isSpectator,
                }
                : prev);
        });

        // All players ready → start game
        newConn.on("AllPlayersReady", () => {
            setIsWaitingForTurnOrder(true);
        });

        // 2. Thứ tự lượt nói
        newConn.on("TurnOrderGenerated", (data: { roundNumber: number; turnOrder: string[] }) => {
            setRoundNumber(data.roundNumber);
            setTurnOrder(data.turnOrder);
            setCurrentTurnIndex(0);
            setTurnEndTime(0); // Đặt về 0 để DescribingPhase biết là chưa bắt đầu đếm
        });

        // 3. Lượt nói bắt đầu
        newConn.on("TurnStarted", (data: {
            currentSpeakerId: string;
            currentTurnIndex: number;
            duration: number;
            remainingMs?: number;
        }) => {
            setCurrentTurnIndex(data.currentTurnIndex);
            setDescribeDuration(data.duration ?? 30);
            
            // Lấy thời gian còn lại do server gửi (hoặc fallback mặc định) cộng vào Date.now() của máy khách
            const remaining = data.remainingMs ?? ((data.duration ?? 30) * 1000);
            setTurnEndTime(Date.now() + remaining);
            setShowWhiteHatGuess(false); // Fix: always hide White Hat overlay when a new turn starts
        });

        // 4. Lượt nói kết thúc / skip
        newConn.on("TurnEnded", (data: { nextTurnIndex: number }) => {
            setCurrentTurnIndex(data.nextTurnIndex);
        });
        newConn.on("TurnSkipped", (data: { nextTurnIndex: number }) => {
            setCurrentTurnIndex(data.nextTurnIndex);
        });

        // 5. Bắt đầu vote
        newConn.on("TypingSynchronized", (data: { userId: string; text: string }) => {
            setTypingSync(prev => ({
                ...prev,
                [data.userId]: { text: data.text, isFinal: false }
            }));
        });

        newConn.on("DescriptionSubmitted", (data: { userId: string; word: string }) => {
            setTypingSync(prev => ({
                ...prev,
                [data.userId]: { text: data.word, isFinal: true }
            }));
            setRoomState(prev => {
                if (!prev || !prev.players[data.userId]) return prev;

                const player = prev.players[data.userId];
                return {
                    ...prev,
                    players: {
                        ...prev.players,
                        [data.userId]: {
                            ...player,
                            descriptionHistory: [...(player.descriptionHistory ?? []), data.word],
                        },
                    },
                };
            });
        });

        newConn.on("VotingStarted", (data: { endTime: number; duration?: number }) => {
            setTypingSync({});
            setVoteEndTime(data.endTime ?? Date.now() + (data.duration ?? 60) * 1000);
            setHasVoted(false);
            setMyVoteTarget(null);
            setVoteCounts({});
            setRealtimeVotes({});
            setExtendVoteCount(0);
            setSkipVoteCount(0);
            setHasRequestedExtend(false);
            setIsTimeExtended(false);
            setHasSkippedVote(false);
            setLoadingSync(null);
            setGamePhase('voting');
        });

        // 6. Vote count update realtime
        newConn.on("VoteUpdated", (data: { voteCounts: VoteCounts, totalVotesCast?: number, votes?: Record<string, string> }) => {
            setVoteCounts(data.voteCounts);
            if (data.votes) setRealtimeVotes(data.votes);
            if (data.totalVotesCast !== undefined) {
                setTotalVotesCast(data.totalVotesCast);
            }
        });

        newConn.on("ExtendVoteCountUpdated", (data: { extendCount: number; requiredCount: number; extendPlayerIds?: string[] }) => {
            setExtendVoteCount(data.extendCount);
            setExtendRequiredCount(data.requiredCount);
            if (data.extendPlayerIds) {
                setHasRequestedExtend(data.extendPlayerIds.includes(storedUserId));
            }
        });

        newConn.on("SkipVoteCountUpdated", (data: { skipCount: number; requiredCount: number; skipPlayerIds?: string[] }) => {
            setSkipVoteCount(data.skipCount);
            setSkipRequiredCount(data.requiredCount);
            if (data.skipPlayerIds) {
                setHasSkippedVote(data.skipPlayerIds.includes(storedUserId));
            }
        });

        newConn.on("VoteTimeExtended", (data: { newEndTime: number }) => {
            setVoteEndTime(data.newEndTime);
            setIsTimeExtended(true);
        });

        newConn.on("PhaseChanged", (data: any) => {
            const phase = (data.phase as string)?.toLowerCase?.();
            if (!phase) return;

            if (phase === 'describing') {
                if (data.turnOrder) setTurnOrder(data.turnOrder);
                if (typeof data.currentTurnIndex === 'number') setCurrentTurnIndex(data.currentTurnIndex);
                setLoadingSync(null);
                setGamePhase('describing');
                setShowWhiteHatGuess(false);
            }
            if (phase === 'voting') {
                setVoteEndTime(data.voteEndTime ?? Date.now() + 60000);
                setHasVoted(false);
                setMyVoteTarget(null);
                setVoteCounts({});
                setRealtimeVotes({});
                setTotalVotesCast(0);
                setExtendVoteCount(0);
                setSkipVoteCount(0);
                setHasRequestedExtend(false);
                setIsTimeExtended(false);
                setHasSkippedVote(false);
                setLoadingSync(null);
                setWhiteHatInfo(null);
                setGamePhase('voting');
            }
            if (phase === 'whitehatguess') {
                setPendingWinner(data.pendingWinner ?? null);
                setShowWhiteHatGuess(true);
            }
            if (phase === 'gameend') {
                setGamePhase('gameEnded');
            }
        });

        // 7. Round transition
        newConn.on("RoundTransitionStarted", (data: {
            roundNumber: number;
            countdownDuration: number;
            alivePlayers: { userId: string; displayName: string }[];
            eliminatedPlayer?: { userId: string; displayName: string } | null;
            eliminatedPlayerRole?: string | null;
            isTieVote: boolean;
        }) => {
            setTransitionData({
                roundNumber: data.roundNumber,
                isTieVote: data.isTieVote,
                eliminatedPlayerName: data.eliminatedPlayer?.displayName ?? null,
                eliminatedPlayerRole: data.eliminatedPlayerRole ?? null,
                alivePlayers: data.alivePlayers,
                countdownDuration: data.countdownDuration,
            });
            setGamePhase('roundTransition');
            setShowWhiteHatGuess(false); // Fix: hide White Hat overlay during transition

            // Update room state players eliminated status
            if (data.eliminatedPlayer) {
                const storedUserId = sessionStorage.getItem("userId");
                if (data.eliminatedPlayer.userId === storedUserId) {
                    if (gameSoundsRef.current.playLose) gameSoundsRef.current.playLose();
                }

                setRoomState(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        players: {
                            ...prev.players,
                            [data.eliminatedPlayer!.userId]: {
                                ...prev.players[data.eliminatedPlayer!.userId],
                                isEliminated: true,
                            }
                        }
                    };
                });
            }
        });

        // 8. Player eliminated (có thể server gửi riêng)
        newConn.on("PlayerEliminated", (data: { userId: string; displayName: string }) => {
            const storedUserId = sessionStorage.getItem("userId");
            if (data.userId === storedUserId) {
                if (gameSoundsRef.current.playLose) gameSoundsRef.current.playLose();
            }

            setRoomState(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    players: {
                        ...prev.players,
                        [data.userId]: { ...prev.players[data.userId], isEliminated: true }
                    }
                };
            });
        });

        // 9. Game ended
        newConn.on("GameEnded", (data: {
            winner: string;
            civilianWord?: string;
            players: { userId: string; displayName: string; role: string; isEliminated: boolean }[];
        }) => {
            setGameEndedData(data);
            setGamePhase('gameEnded');
            setShowWhiteHatGuess(false);
        });

        // 10. Error
        newConn.on("ErrorMessage", (message: string) => {
            addNotif(message, 'warning');
        });

        // 11. White Hat opportunity
        newConn.on("WhiteHatOpportunity", (data: { pendingWinner: string, timeLeft: number, whiteHatDisplayName: string, whiteHatUserId: string }) => {
            setPendingWinner(data.pendingWinner);
            setWhiteHatTimeLeft(data.timeLeft || 20);
            setWhiteHatInfo({ userId: data.whiteHatUserId, displayName: data.whiteHatDisplayName });
            setShowWhiteHatGuess(true);
        });

        // 11b. White Hat Guess Result
        newConn.on("WhiteHatGuessResult", (data: { isCorrect: boolean, displayName: string }) => {
            setShowWhiteHatGuess(false);
            if (!data.isCorrect) {
                addNotif(`${data.displayName} đã đoán sai từ khóa và bị loại!`, 'warning');
            }
        });

        // 12. Compat: RoundStarted (old event)
        newConn.on("RoundStarted", (room: RoomState) => {
            setRoomState(room);
        });

        // ── Start connection ─────────────────────
                const start = async () => {
            if (newConn.state === HubConnectionState.Disconnected) {
                try {
                    await newConn.start();
                } catch (err: any) {
                    console.error("❌ SignalR Error:", err);
                    return;
                }
            }
            if (isMounted) {
                setConnection(newConn);
                try {
                    await newConn.invoke("JoinRoom", roomId);
                    await newConn.invoke("GetRoomState", roomId);
                    joinVoiceChat(newConn); // Tự động kết nối mic ngay khi vào phòng
                    const pendingLoading = sessionStorage.getItem(`loading:${roomId}`);
                    if (pendingLoading) {
                        sessionStorage.removeItem(`loading:${roomId}`);
                        const parsed = JSON.parse(pendingLoading) as { timeoutSeconds?: number; totalCount?: number; startedAt?: number };
                        const timeoutSeconds = parsed.timeoutSeconds ?? 60;
                        const startedAt = parsed.startedAt ?? Date.now();
                        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
                        const hash = roomId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
                        const syncedBackground = GAME_BACKGROUNDS[hash % GAME_BACKGROUNDS.length];

                        setLoadingSync({
                            readyCount: 0,
                            totalCount: parsed.totalCount ?? 0,
                            readyPlayerIds: [],
                            timeoutSeconds,
                            startedAt,
                            secondsLeft: Math.max(0, timeoutSeconds - elapsed),
                            isMeReady: false,
                            isSpectator: false,
                            spectatorIds: [],
                            activePlayerIds: [],
                        });
                        setGamePhase(prev => prev === 'roleRevealing' ? 'roleRevealing' : 'loading');
                        await preloadGameAssets(syncedBackground);
                        try {
                            await newConn.invoke("PlayerLoadingReady", roomId);
                            setLoadingSync(prev => prev ? {
                                ...prev,
                                isMeReady: true,
                                readyPlayerIds: prev.readyPlayerIds.includes(storedUserId)
                                    ? prev.readyPlayerIds
                                    : [...prev.readyPlayerIds, storedUserId],
                            } : prev);
                        } catch (e) {
                            console.error("PlayerLoadingReady error:", e);
                        }
                    }
                } catch (err) {
                    console.error("Error joining room or getting state:", err);
                }
            }
        };
        start();

                return () => {
            isMounted = false;
            newConn.off('RoomJoined');
            newConn.off('RoomError');
            newConn.off('KickedFromRoom');
            newConn.off('RoomUpdated');
            newConn.off('ExistingVoiceUsers');
            newConn.off('UserJoinedVoice');
            newConn.off('ReceiveSignal');
            newConn.off('PlayerDisconnected');
            newConn.off('ReceiveSecretWord');
            newConn.off('RoleAssigned');
            newConn.off('ReturnedToLobby');
            newConn.off('LoadingPhaseStarted');
            newConn.off('LoadingProgressUpdated');
            newConn.off('SwitchedToSpectator');
            newConn.off('SpectatorUpdated');
            newConn.off('GameStarted');
            newConn.off('AllPlayersReady');
            newConn.off('TurnOrderGenerated');
            newConn.off('PlayerLeft');
            newConn.off('TurnStarted');
            newConn.off('TurnEnded');
            newConn.off('TurnSkipped');
            newConn.off('DescriptionSubmitted');
            newConn.off('VotingStarted');
            newConn.off('VoteUpdated');
            newConn.off('PhaseChanged');
            newConn.off('RoundTransitionStarted');
            newConn.off('PlayerEliminated');
            newConn.off('GameEnded');
            newConn.off('ErrorMessage');
            newConn.off('WhiteHatOpportunity');
            newConn.off('WhiteHatGuessResult');
            newConn.off('RoundStarted');
            leaveVoice(newConn); // dọn voice khi rời trang game (destroy peers + tắt mic + báo server)
            newConn.off('TypingSynchronized');
            newConn.off('ExtendVoteCountUpdated');
            newConn.off('SkipVoteCountUpdated');
            newConn.off('VoteTimeExtended');
        };
    }, [roomId]);

    // ================================
    // Derived state
    // ================================
    const players = roomState ? Object.values(roomState.players) as Player[] : [];
    const currentPlayerCount = players.length;
    const myPlayer = players.find(p => p.userId === currentUserId);

    useEffect(() => {
        roomStateRef.current = roomState;
    }, [roomState]);

    useEffect(() => {
        if (gamePhase !== 'loading' || !loadingSync) return;

        const interval = window.setInterval(() => {
            setLoadingSync(prev => {
                if (!prev) return prev;
                const elapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
                return {
                    ...prev,
                    secondsLeft: Math.max(0, prev.timeoutSeconds - elapsed),
                };
            });
        }, 250);

        return () => window.clearInterval(interval);
    }, [gamePhase, loadingSync?.startedAt]);

    const isHost = roomState?.hostId === currentUserId;
    const isEliminated = myPlayer?.isEliminated ?? false;

    const playersForVoting = players.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        avatar: p.avatar,
        role: p.role ?? 'Civilian',
        isEliminated: p.isEliminated ?? false,
        voteCount: voteCounts[p.userId] ?? 0,
        descriptionHistory: p.descriptionHistory ?? [],
    }));

    const playersForDescribing = players.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        avatar: p.avatar,
        isEliminated: p.isEliminated ?? false,
    }));

    const loadingReadyPlayerIds = useMemo(() => {
        if (!loadingSync) return [];
        return loadingSync.readyPlayerIds
            .map(id => players.find(p => p.userId === id || p.connectionId === id)?.userId ?? id);
    }, [loadingSync, players]);

    const loadingSpectatorIds = useMemo(() => {
        if (!loadingSync) return [];
        return loadingSync.spectatorIds
            .map(id => players.find(p => p.userId === id || p.connectionId === id)?.userId ?? id);
    }, [loadingSync, players]);

    const loadingPlayers = players.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        isSpectator: loadingSpectatorIds.includes(p.userId),
    }));

    const backgroundImage = useMemo(() => {
        const hash = roomId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        return GAME_BACKGROUNDS[hash % GAME_BACKGROUNDS.length];
    }, [roomId]);

    const pageRootStyle = {
        minHeight: '100vh',
        width: '100vw',
        position: 'relative' as const,
        backgroundImage: `linear-gradient(180deg, rgba(8,10,16,0.88), rgba(8,10,16,0.55)), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden',
        color: '#fff',
    };

    // ================================
    // RENDER BY PHASE
    // ================================

    const isMyWhiteHatGuess = mySecret?.role === 'WhiteHat' && (!whiteHatInfo || whiteHatInfo.userId === currentUserId);

    if (gamePhase === 'loading' && loadingSync) {
        return (
            <div style={pageRootStyle}>
                {overlayElements}
                <Notification messages={notifications} />
                {leaveRoomButton}
                <LoadingPhaseScreen
                    players={loadingPlayers}
                    readyPlayerIds={loadingReadyPlayerIds}
                    readyCount={loadingSync.readyCount}
                    totalCount={loadingSync.totalCount || currentPlayerCount}
                    secondsLeft={loadingSync.secondsLeft}
                    isMeReady={loadingSync.isMeReady || loadingReadyPlayerIds.includes(currentUserId)}
                    isSpectator={loadingSync.isSpectator}
                    spectatorReason={loadingSync.spectatorReason}
                    backgroundImage={backgroundImage}
                />
            </div>
        );
    }

    // Role Revealing
    if (gamePhase === 'roleRevealing' && mySecret) {
        return (
            <div style={pageRootStyle}>
                {overlayElements}
                <Notification messages={notifications} />
                {leaveRoomButton}
                <RoleRevealingScreen
                    role={mySecret.role}
                    word={mySecret.word}
                    backgroundImage={backgroundImage}
                    onReadyToContinue={handleRoleRevealAdvance}
                />
            </div>
        );
    }

    // Round Transition
    if (gamePhase === 'roundTransition' && transitionData) {
        return (
            <div style={pageRootStyle}>
                {overlayElements}
                <Notification messages={notifications} />
                {leaveRoomButton}
                <RoundTransitionScreen
                    roundNumber={transitionData.roundNumber}
                    isTieVote={transitionData.isTieVote}
                    eliminatedPlayerName={transitionData.eliminatedPlayerName}
                    eliminatedPlayerRole={transitionData.eliminatedPlayerRole}
                    alivePlayers={transitionData.alivePlayers}
                    countdownDuration={transitionData.countdownDuration}
                    onCountdownEnd={() => {
                        setGamePhase('describing');
                    }}
                    backgroundImage={backgroundImage}
                />
            </div>
        );
    }

    // Game Ended
    if (gamePhase === 'gameEnded' && gameEndedData) {
        return (
            <div style={pageRootStyle}>
                {overlayElements}
                {leaveRoomButton}
                <GameEndedScreen
                    winner={gameEndedData.winner}
                    myRole={mySecret?.role ?? 'Civilian'}
                    myWord={mySecret?.word ?? ''}
                    civilianWord={gameEndedData.civilianWord}
                    players={gameEndedData.players}
                    myUserId={currentUserId}
                    roomId={roomId}
                    onPlayAgain={handlePlayAgain}
                    backgroundImage={backgroundImage}
                />
            </div>
        );
    }

    // Describing Phase
    if (gamePhase === 'describing') {
        return (
            <div style={pageRootStyle}>
                {overlayElements}
                <Notification messages={notifications} />
                {leaveRoomButton}
                {showWhiteHatGuess && isMyWhiteHatGuess && (
                    <WhiteHatGuessOverlay
                        isWhiteHat={true}
                        onGuess={handleWhiteHatGuess}
                        onCancel={() => setShowWhiteHatGuess(false)}
                    />
                )}
                {isMyWhiteHatGuess && !isEliminated && !showWhiteHatGuess && (
                    <button
                        onClick={() => setShowWhiteHatGuess(true)}
                        style={{
                            position: "fixed", bottom: 24, left: 24, zIndex: 60,
                            padding: "14px 28px", borderRadius: 99, border: "2px solid #FFD700",
                            background: "linear-gradient(135deg, #2b1b18, #3e2723)",
                            color: "#FFD700", fontWeight: 900, cursor: "pointer",
                            boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(255,215,0,0.1)",
                            display: "flex", alignItems: "center", gap: 10,
                            letterSpacing: "0.05em",
                            transition: "transform 0.2s"
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"}
                    >
                        <Key size={20} />
                        ĐOÁN TỪ KHÓA
                    </button>
                )}
                <DescribingPhase
                    players={playersForDescribing}
                    turnOrder={turnOrder}
                    currentTurnIndex={currentTurnIndex}
                    myUserId={currentUserId}
                    myRole={mySecret?.role ?? 'Civilian'}
                    myWord={mySecret?.word ?? ''}
                    roundNumber={roundNumber}
                    describeDuration={describeDuration}
                    turnEndTime={turnEndTime}
                    onSkipTurn={handleSkipTurn}
                    onSubmitDescription={handleSubmitDescription}
                    backgroundImage={backgroundImage}
                    typingSync={typingSync}
                    onTyping={(text) => connection?.invoke("SyncTyping", text)}
                />
            </div>
        );
    }

    // Voting Phase
    if (gamePhase === 'voting') {
        return (
            <>
                {overlayElements}
                <Notification messages={notifications} />
                {leaveRoomButton}
                {showWhiteHatGuess && isMyWhiteHatGuess && (
                    <WhiteHatGuessOverlay
                        isWhiteHat={true}
                        onGuess={handleWhiteHatGuess}
                        onCancel={() => setShowWhiteHatGuess(false)}
                        initialTimeLeft={whiteHatTimeLeft}
                        whiteHatInfo={whiteHatInfo}
                    />
                )}
                {isMyWhiteHatGuess && !isEliminated && !showWhiteHatGuess && (
                    <button
                        onClick={() => setShowWhiteHatGuess(true)}
                        style={{
                            position: "fixed", bottom: 24, left: 24, zIndex: 60,
                            padding: "14px 28px", borderRadius: 99, border: "2px solid #FFD700",
                            background: "linear-gradient(135deg, #2b1b18, #3e2723)",
                            color: "#FFD700", fontWeight: 900, cursor: "pointer",
                            boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4), inset 0 0 10px rgba(255,215,0,0.1)",
                            display: "flex", alignItems: "center", gap: 10,
                            letterSpacing: "0.05em",
                            transition: "transform 0.2s"
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)"}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"}
                    >
                        <Key size={20} />
                        ĐOÁN TỪ KHÓA
                    </button>
                )}
                <VotingGrid
                    players={playersForVoting}
                    myUserId={currentUserId}
                    voteEndTime={voteEndTime}
                    realtimeVoteCounts={voteCounts}
                    totalVotesCast={totalVotesCast}
                    realtimeVotes={realtimeVotes}
                    hasVoted={hasVoted}
                    myVoteTarget={myVoteTarget}
                    canSkip={canSkip()}
                    isHost={isHost}
                    isEliminated={isEliminated}
                    extendVoteCount={extendVoteCount}
                    extendRequiredCount={extendRequiredCount}
                    hasRequestedExtend={hasRequestedExtend}
                    isTimeExtended={isTimeExtended}
                    skipVoteCount={skipVoteCount}
                    skipRequiredCount={skipRequiredCount}
                    hasSkippedVote={hasSkippedVote}
                    isWhiteHatGuessing={showWhiteHatGuess}
                    whiteHatId={whiteHatInfo?.userId}
                    whiteHatTimeLeft={whiteHatTimeLeft}
                    onExtendVote={handleExtendVote}
                    onVote={handleVote}
                    onChangeVote={handleChangeVote}
                    onRevokeVote={handleRevokeVote}
                    onSkip={handleSkipVoting}
                    onTimerExpired={() => {
                        if (!hasVoted) {
                            // optional: auto-submit vote or do something else
                        }
                    }}
                    backgroundImage={backgroundImage}
                />
            </>
        );
    }

    // ================================
    // Lobby / default (waiting for game to start)
    // ================================
    const isMyPlayerReady = players.find(p => p.userId === currentUserId)?.isReady ?? false;
    const allReady = players.length >= 3 && players.every(p => p.isReady || p.userId === roomState?.hostId);
    const canStart = isHost && allReady;
    const settings = roomState?.settings || {};
    const maxPlayers = settings.maxPlayers || 8;
    
    // Dynamic sizing based on players
    let gridColsClass = "grid-cols-3";
    let cardPaddingClass = "p-6";
    let avatarSizeClass = "w-24 h-24";
    let iconSize = 40;
    let titleSizeClass = "text-lg";
    let crownSize = 14;
    let readyBadgeClass = "px-3 py-1 text-sm";
    let checkIconSize = 16;
    let cardGapClass = "gap-4";
    let topOffsetClass = "-top-4";

    if (maxPlayers > 6 && maxPlayers <= 10) {
      gridColsClass = "grid-cols-4";
      cardPaddingClass = "p-4";
      avatarSizeClass = "w-16 h-16";
      iconSize = 30;
      titleSizeClass = "text-base";
      crownSize = 12;
      readyBadgeClass = "px-2.5 py-0.5 text-xs";
      checkIconSize = 12;
      cardGapClass = "gap-3";
      topOffsetClass = "-top-3.5";
    } else if (maxPlayers > 10) {
      gridColsClass = "grid-cols-5";
      cardPaddingClass = "p-3";
      avatarSizeClass = "w-12 h-12";
      iconSize = 24;
      titleSizeClass = "text-sm";
      crownSize = 10;
      readyBadgeClass = "px-2 py-0.5 text-[10px]";
      checkIconSize = 10;
      cardGapClass = "gap-2";
      topOffsetClass = "-top-3";
    }

    return (
        <div 
          className="relative min-h-screen w-screen bg-cover bg-center overflow-x-hidden overflow-y-auto flex flex-col items-center pt-20 pb-28 custom-scrollbar"
          style={{ backgroundImage: `linear-gradient(180deg, rgba(7,9,17,0.9) 0%, rgba(7,9,17,0.62) 44%, rgba(4,5,10,0.96) 100%), url(${backgroundImage})` }}
        >
            {overlayElements}
            {leaveRoomButton}

            {/* Background ambient glow */}
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(230,168,34,0.08)_0%,transparent_60%)]" />
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] pointer-events-none bg-[radial-gradient(ellipse_60%_80%_at_50%_100%,rgba(99,102,241,0.06)_0%,transparent_70%)]" />

            <Notification messages={notifications} />

            {/* ── SECRET WORD DISPLAY (Only when game starts/roles are revealed) ── */}
            {mySecret && (
                <div className="mb-10 text-center flex flex-col items-center gap-3 z-10">
                    <p className="text-white/30 text-[10px] tracking-[0.3em] uppercase m-0">
                        Từ khóa bí mật
                    </p>
                    <div
                        onClick={() => setIsChatOpen(p => p)}
                        className="bg-black/40 border-2 border-[#e6a822]/20 rounded-[50px] px-8 py-3 text-[#e6a822] font-black text-xl tracking-[0.15em] cursor-pointer min-w-[240px] text-center shadow-[0_0_20px_rgba(230,168,34,0.08)] backdrop-blur-md"
                    >
                        <span className="animate-pulse">{mySecret.word}</span>
                    </div>
                </div>
            )}

            {/* ====== MAIN LAYOUT ====== */}
            <div className="flex flex-col lg:flex-row gap-6 w-full max-w-5xl z-10 items-start px-4 sm:px-0 mt-8">
                {/* PLAYER GRID */}
                <div className="flex-1 w-full">
                    <div className={`grid ${gridColsClass} gap-3.5 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar`}>
                        {players.map(player => {
                            const isMe = player.userId === currentUserId;
                            const isPlayerHost = player.userId === roomState?.hostId;
                            return (
                                <div key={player.userId} 
                                    className={`backdrop-blur-md rounded-2xl ${cardPaddingClass} flex flex-col items-center ${cardGapClass} relative transition-all duration-300 ${
                                        player.isEliminated
                                            ? "bg-black/30 border border-red-500/15 grayscale-[60%] opacity-60"
                                            : player.isReady 
                                                ? "bg-gradient-to-br from-green-500/10 to-white/5 border border-green-500/25 shadow-[0_0_20px_rgba(34,197,94,0.06)]"
                                                : isMe 
                                                    ? "bg-white/5 border border-[#e6a822]/30 shadow-[0_0_20px_rgba(230,168,34,0.08)]"
                                                    : "bg-white/5 border border-white/10"
                                    }`}
                                >
                                    {isPlayerHost && (
                                        <div className={`absolute ${topOffsetClass} left-1/2 -translate-x-1/2 bg-gradient-to-br from-[#e6a822] to-[#d4941a] text-black px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-[0_4px_12px_rgba(230,168,34,0.4)] tracking-widest`}>
                                            <Shield size={crownSize} fill="currentColor" /> CHỦ PHÒNG
                                        </div>
                                    )}

                                    <div className={`${avatarSizeClass} rounded-full flex items-center justify-center font-black text-2xl overflow-hidden shadow-inner ${
                                        isMe 
                                            ? "bg-[radial-gradient(circle_at_35%_35%,rgba(230,168,34,0.3),#0a0a14)] border-2 border-[#e6a822]/50 text-[#e6a822] shadow-[0_0_16px_rgba(230,168,34,0.2)]"
                                            : "bg-[radial-gradient(circle_at_35%_35%,rgba(99,102,241,0.2),#0a0a14)] border-2 border-indigo-500/30 text-indigo-500"
                                    } ${isPlayerHost ? 'mt-2' : ''}`}>
                                        {player.avatar ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={player.avatar} alt={player.displayName} className="w-full h-full object-cover" />
                                        ) : (
                                            player.displayName?.charAt(0)?.toUpperCase() || "?"
                                        )}
                                    </div>

                                    <div className="text-center w-full">
                                        <h3 className={`${isMe ? 'text-[#e6a822]' : 'text-white'} font-bold ${titleSizeClass} truncate px-1 w-full`}>
                                            {player.displayName}
                                        </h3>
                                        {isMe && <p className="text-[#e6a822]/60 text-[10px] mt-0.5 tracking-widest uppercase">(Bạn)</p>}
                                    </div>

                                    {player.isEliminated && (
                                        <span className="text-lg">❌</span>
                                    )}

                                    {!mySecret && !player.isEliminated && (
                                        player.isReady ? (
                                            <span className={`flex items-center gap-1.5 text-green-500 font-extrabold bg-green-500/10 border border-green-500/30 ${readyBadgeClass} rounded-full tracking-wider`}>
                                                <CheckCircle2 size={checkIconSize} /> SẴN SÀNG
                                            </span>
                                        ) : (
                                            <span className={`text-white/30 font-semibold bg-white/5 border border-white/10 ${readyBadgeClass} rounded-full`}>
                                                Đang chờ...
                                            </span>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* SETTINGS PANEL (Host only) */}
                {isHost && (
                    <div className="w-full lg:w-[280px] shrink-0 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl flex flex-col h-fit">
                        <button
                            onClick={() => { playClick(); setShowSettings(!showSettings); }}
                            className={`w-full px-5 py-4 bg-transparent border-none flex items-center gap-3 cursor-pointer text-white transition-all hover:bg-white/5 ${showSettings ? 'border-b border-white/10' : ''}`}
                        >
                            <Settings size={18} className="text-[#e6a822]" />
                            <span className="font-bold text-sm flex-1 text-left uppercase tracking-wider">Cài đặt phòng</span>
                            {showSettings ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
                        </button>

                        {showSettings && (
                            <div className="p-5 flex flex-col gap-5">
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                                            <Clock size={14} className="text-green-500" /> Thời gian nói
                                        </div>
                                        <span className="text-green-500 font-black text-sm">{localSettings.describeDuration}s</span>
                                    </div>
                                    <input
                                        type="range" min={15} max={60} step={5}
                                        value={localSettings.describeDuration}
                                        onChange={e => handleUpdateSettings({ describeDuration: Number(e.target.value) })}
                                        className="w-full accent-green-500"
                                    />
                                    <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                                        <span>15s</span><span>60s</span>
                                    </div>
                                </div>

                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                                            <Vote size={14} className="text-[#e6a822]" /> Thời gian vote
                                        </div>
                                        <span className="text-[#e6a822] font-black text-sm">{localSettings.voteDuration}s</span>
                                    </div>
                                    <input
                                        type="range" min={30} max={90} step={15}
                                        value={localSettings.voteDuration}
                                        onChange={e => handleUpdateSettings({ voteDuration: Number(e.target.value) })}
                                        className="w-full accent-[#e6a822]"
                                    />
                                    <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                                        <span>30s</span><span>90s</span>
                                    </div>
                                </div>

                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-white/70 text-xs font-bold uppercase tracking-wide">
                                            <Clock size={14} className="text-indigo-500" /> Chờ giữa vòng
                                        </div>
                                        <span className="text-indigo-500 font-black text-sm">{localSettings.roundTransitionDuration}s</span>
                                    </div>
                                    <input
                                        type="range" min={5} max={10} step={1}
                                        value={localSettings.roundTransitionDuration}
                                        onChange={e => handleUpdateSettings({ roundTransitionDuration: Number(e.target.value) })}
                                        className="w-full accent-indigo-500"
                                    />
                                    <div className="flex justify-between text-white/20 text-[10px] mt-1 font-medium">
                                        <span>5s</span><span>10s</span>
                                    </div>
                                </div>
                                
                                <div 
                                    onClick={() => handleUpdateSettings({ revealEliminatedRole: !localSettings.revealEliminatedRole })}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                                        localSettings.revealEliminatedRole 
                                        ? 'bg-green-500/10 border-green-500/20' 
                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    {localSettings.revealEliminatedRole ? <Eye size={18} className="text-green-500"/> : <EyeOff size={18} className="text-white/30"/>}
                                    <div className="flex-1">
                                        <div className="text-white text-xs font-bold">Tiết lộ vai</div>
                                        <div className="text-white/30 text-[10px] mt-0.5">
                                        {localSettings.revealEliminatedRole ? "Công khai" : "Ẩn thân"}
                                        </div>
                                    </div>
                                    <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${localSettings.revealEliminatedRole ? 'bg-green-500' : 'bg-white/10'}`}>
                                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${localSettings.revealEliminatedRole ? 'left-[18px]' : 'left-0.5'}`} />
                                    </div>
                                </div>
                                <button
                                    onClick={() => { playClick(); setShowLeaveConfirm(true); }}
                                    className="flex items-center justify-center gap-2 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 px-4 py-3 rounded-xl transition-all font-bold text-sm tracking-wide"
                                >
                                    RỜI PHÒNG
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ====== BOTTOM ACTIONS (SẴN SÀNG / BẮT ĐẦU) ====== */}
            {!mySecret && (
                <div className="fixed bottom-0 left-0 right-0 px-6 py-5 bg-gradient-to-t from-[#0a0a14] via-[#0a0a14]/90 to-transparent flex justify-center gap-4 z-50 pointer-events-none">
                    <div className="pointer-events-auto flex gap-4">
                        {!isHost && (
                            <button
                                onClick={() => { playReady(); connection?.invoke("ToggleReady", !isMyPlayerReady); }}
                                className={`px-10 py-3.5 rounded-2xl font-black text-sm md:text-base cursor-pointer tracking-wider border-none transition-all shadow-[0_8px_24px_rgba(0,0,0,0.4)] ${
                                    isMyPlayerReady
                                        ? 'bg-white/10 text-white/50 border-t border-white/10'
                                        : 'bg-gradient-to-br from-green-500 to-green-600 text-white hover:-translate-y-0.5'
                                }`}
                            >
                                {isMyPlayerReady ? "✖ HỦY SẴN SÀNG" : "✓ SẴN SÀNG"}
                            </button>
                        )}

                        {isHost && (
                            <button
                                onClick={async () => {
                                    playStart();
                                    if (!connection) return;
                                    try { await connection.invoke("StartGame"); }
                                    catch (err) { console.error("StartGame error:", err); }
                                }}
                                disabled={!canStart}
                                className={`px-12 py-3.5 rounded-2xl font-black text-sm md:text-base tracking-wider border-none transition-all flex items-center gap-2.5 ${
                                    canStart
                                        ? 'bg-gradient-to-br from-[#e6a822] to-[#d4941a] text-black shadow-[0_8px_32px_rgba(230,168,34,0.35)] hover:-translate-y-0.5 cursor-pointer'
                                        : 'bg-white/5 text-white/20 cursor-not-allowed'
                                }`}
                            >
                                BẮT ĐẦU GAME
                            </button>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

// Helper — move outside component to avoid recreation
function canSkip() { return true; } // Logic thực sẽ do server control
