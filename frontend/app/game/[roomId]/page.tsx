"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    HubConnection,
    HubConnectionBuilder,
    HubConnectionState
} from '@microsoft/signalr';
import { Shield, MessageSquare, Settings, Clock, Vote, Eye, EyeOff, ChevronUp, ChevronDown, CheckCircle2, LogOut, Key } from 'lucide-react';
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
import { API_URL } from '@/lib/auth';

type PeerInstance = any;

// ================================
// Types
// ================================
interface Player {
    userId: string;
    displayName: string;
    connectionId: string;
    isReady?: boolean;
    isEliminated?: boolean;
    role?: string;
    descriptionHistory?: string[];
}

interface RoomState {
    hostId: string;
    players: Record<string, Player>;
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

const GAME_BACKGROUNDS = ['/bg1.jpg', '/bg2.jpg', '/bg3.jpg', '/bg4.png'];

// ================================
// Notification toast
// ================================
function Notification({ messages }: { messages: { id: string; type: 'info' | 'warning' | 'result'; text: string }[] }) {
    const typeStyle = {
        info: { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.3)", color: "#818cf8", prefix: "ℹ️" },
        warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", color: "#fbbf24", prefix: "⚠️" },
        result: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", color: "#f87171", prefix: "📢" },
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

    // ── Voting ──────────────────────────────
    const [voteEndTime, setVoteEndTime] = useState(Date.now() + 60000);
    const [voteCounts, setVoteCounts] = useState<VoteCounts>({});
    const [hasVoted, setHasVoted] = useState(false);
    const [myVoteTarget, setMyVoteTarget] = useState<string | null>(null);

    // ── Round Transition ────────────────────
    const [transitionData, setTransitionData] = useState<RoundTransitionData | null>(null);

    // ── Game Ended ──────────────────────────
    const [gameEndedData, setGameEndedData] = useState<GameEndedData | null>(null);

    // ── White Hat ───────────────────────────
    const [showWhiteHatGuess, setShowWhiteHatGuess] = useState(false);
    const [pendingWinner, setPendingWinner] = useState<string | null>(null);

    // ── Voice ────────────────────────────────
    const [isMicOn, setIsMicOn] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [isJoinedVoice, setIsJoinedVoice] = useState(false);
    const userStream = useRef<MediaStream | null>(null);
    const peers = useRef<Record<string, PeerInstance>>({});
    const remoteAudios = useRef<Record<string, HTMLAudioElement>>({});

    // ── Room / UI ───────────────────────────
    const [roomState, setRoomState] = useState<RoomState | null>(null);
    const roomStateRef = useRef<RoomState | null>(null);
    const [currentUser, setCurrentUser] = useState<string>("");
    const [currentUserId, setCurrentUserId] = useState<string>("");
    const [isChatOpen, setIsChatOpen] = useState(false);

    // ── Settings ────────────────────────────
    const [showSettings, setShowSettings] = useState(false);
    const [localSettings, setLocalSettings] = useState<any>({
        describeDuration: 30,
        voteDuration: 60,
        revealEliminatedRole: true,
        roundTransitionDuration: 5,
    });

    // ── Notifications ───────────────────────
    const [notifications, setNotifications] = useState<{ id: string; type: 'info' | 'warning' | 'result'; text: string }[]>([]);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const addNotif = (text: string, type: 'info' | 'warning' | 'result' = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setNotifications(prev => [...prev.slice(-3), { id, type, text }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
    };

    // ================================
    // WebRTC helpers
    // ================================
    const createPeer = async (targetId: string, conn: HubConnection, initiator: boolean) => {
        const Peer = (await import('simple-peer')).default;
        const peer = new Peer({
            initiator,
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
        peer.on('connect', () => console.log(`✅ P2P connected: ${targetId}`));
        peer.on('error', (err: any) => { console.error('Peer error:', err); cleanupPeer(targetId); });
        peer.on('close', () => cleanupPeer(targetId));
        return peer;
    };

    const cleanupPeer = (id: string) => {
        if (peers.current[id]) { peers.current[id].destroy(); delete peers.current[id]; }
        if (remoteAudios.current[id]) { remoteAudios.current[id].remove(); delete remoteAudios.current[id]; }
    };

    const joinVoiceChat = async (activeConn: HubConnection) => {
        try {
            if (!userStream.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getAudioTracks().forEach(t => t.enabled = false);
                userStream.current = stream;
            }
            await activeConn.invoke("StartVoiceChat", roomId);
            setIsJoinedVoice(true);
        } catch (err) {
            console.error("❌ Mic access denied:", err);
        }
    };

    // ================================
    // Controls
    // ================================
    const toggleMic = () => {
        if (!userStream.current) return;
        const newState = !isMicOn;
        userStream.current.getAudioTracks().forEach(t => t.enabled = newState);
        setIsMicOn(newState);
    };

    const toggleSpeaker = () => {
        const newState = !isSpeakerOn;
        setIsSpeakerOn(newState);
        Object.values(remoteAudios.current).forEach(audio => audio.muted = !newState);
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
            addNotif(`Đã bầu cho ${roomState?.players[targetUserId]?.displayName ?? targetUserId}`, 'info');
        } catch (e) { console.error("Vote error:", e); }
    };

    const handleChangeVote = async (targetUserId: string) => {
        if (!connection) return;
        try {
            await connection.invoke("ChangeVote", targetUserId);
            setMyVoteTarget(targetUserId);
            addNotif(`Đã đổi vote sang ${roomState?.players[targetUserId]?.displayName ?? targetUserId}`, 'info');
        } catch (e) { console.error("ChangeVote error:", e); }
    };

    const handleSkipVoting = async () => {
        if (!connection) return;
        try { await connection.invoke("SkipVoting"); }
        catch (e) { console.error("SkipVoting error:", e); }
    };

    const handleWhiteHatGuess = async (word: string) => {
        if (!connection) return;
        try { await connection.invoke("UseWhiteHatGuess", word); }
        catch (e) { console.error("WhiteHatGuess error:", e); }
        setShowWhiteHatGuess(false);
    };

    const handlePlayAgain = async () => {
        if (!connection) return;
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

    const overlayElements = (
        <>
            {confirmLeaveOverlay}
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
        if (typeof window === "undefined") return;
        await Promise.allSettled(
            GAME_BACKGROUNDS.concat(imageUrl)
                .filter((url, index, list) => list.indexOf(url) === index)
                .map(url => new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                    img.src = url;
                }))
        );
    }, []);

    // ================================
    // SignalR setup
    // ================================
    useEffect(() => {
        let isMounted = true;
        const storedUserId = localStorage.getItem('userId') || '';
        setCurrentUserId(storedUserId);

        const newConn = new HubConnectionBuilder()
            .withUrl(`${API_URL}/gamehub`, {
                accessTokenFactory: () => localStorage.getItem('token') || ""
            })
            .withAutomaticReconnect()
            .build();

        // ── Room events ──────────────────────────
        newConn.on("RoomJoined", (room: RoomState) => {
            setRoomState(room);
            newConn.invoke("GetRoomState", roomId).catch(console.error);
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
        newConn.on('UserJoinedVoice', async (newcomerId: string) => {
            if (!peers.current[newcomerId]) {
                const peer = await createPeer(newcomerId, newConn, true);
                peers.current[newcomerId] = peer;
            }
        });
        newConn.on('ReceiveSignal', async (senderId: string, signal: string) => {
            let peer = peers.current[senderId];
            if (!peer) {
                peer = await createPeer(senderId, newConn, false);
                peers.current[senderId] = peer;
            }
            peer.signal(JSON.parse(signal));
        });
        newConn.on('PlayerDisconnected', (id: string) => cleanupPeer(id));

        // ── Game phase events ────────────────────

        // 1. Nhận vai trò bí mật → chuyển sang phase roleRevealing
        newConn.on("ReceiveSecretWord", (data: { role: string; word: string }) => {
            setMySecret(data);
            setGamePhase('roleRevealing');
            addNotif(data.word
                ? `Bạn đã nhận từ khóa: ${data.word}`
                : 'Bạn đã nhận vai trò. Chờ bắt đầu lượt miêu tả.',
                'info');
        });

        // Backward-compat with old event name
        newConn.on("RoleAssigned", (data: { role: string; word: string }) => {
            setMySecret(data);
            setGamePhase('roleRevealing');
            addNotif(data.word
                ? `Bạn đã nhận từ khóa: ${data.word}`
                : 'Bạn đã nhận vai trò. Chờ bắt đầu lượt miêu tả.',
                'info');
        });

        newConn.on("ReturnedToLobby", () => {
            console.log("Phòng đã được reset bởi chủ phòng. Bạn có thể tự bấm Chơi Lại.");
        });

        newConn.on("LoadingPhaseStarted", async (data: { timeoutSeconds?: number; totalCount?: number; startedAt?: number; readyCount?: number; readyPlayerIds?: string[] }) => {
            const timeoutSeconds = data.timeoutSeconds ?? 10;
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
                timeoutSeconds: prev?.timeoutSeconds ?? 10,
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
                timeoutSeconds: prev?.timeoutSeconds ?? 10,
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
            setTurnOrder(data.turnOrder);
            setCurrentTurnIndex(0);
            setRoundNumber(data.roundNumber);
            setIsWaitingForTurnOrder(false);
            setLoadingSync(null);
            setGamePhase('describing');
            addNotif(`Vòng ${data.roundNumber} bắt đầu! Thứ tự đã được random.`, 'info');
        });

        // 3. Lượt nói bắt đầu
        newConn.on("TurnStarted", (data: {
            currentSpeakerId: string;
            currentTurnIndex: number;
            duration: number;
            endTime?: number;
        }) => {
            setCurrentTurnIndex(data.currentTurnIndex);
            setDescribeDuration(data.duration ?? 30);
            if (data.endTime) setTurnEndTime(data.endTime);
            else setTurnEndTime(Date.now() + (data.duration ?? 30) * 1000);

            const players = roomStateRef.current ? Object.values(roomStateRef.current.players) : [];
            const speaker = players.find((p: any) => p.userId === data.currentSpeakerId) as any;
            if (speaker) {
                if (data.currentSpeakerId === storedUserId) {
                    addNotif('Đến lượt bạn miêu tả!', 'result');
                } else {
                    addNotif(`Đến lượt ${speaker.displayName} miêu tả.`, 'info');
                }
            }
        });

        // 4. Lượt nói kết thúc / skip
        newConn.on("TurnEnded", (data: { nextTurnIndex: number }) => {
            setCurrentTurnIndex(data.nextTurnIndex);
        });
        newConn.on("TurnSkipped", (data: { nextTurnIndex: number }) => {
            setCurrentTurnIndex(data.nextTurnIndex);
        });

        // 5. Bắt đầu vote
        newConn.on("DescriptionSubmitted", (data: { userId: string; word: string }) => {
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
            setVoteEndTime(data.endTime ?? Date.now() + (data.duration ?? 60) * 1000);
            setHasVoted(false);
            setMyVoteTarget(null);
            setVoteCounts({});
            setLoadingSync(null);
            setGamePhase('voting');
            addNotif('Vòng bình chọn bắt đầu!', 'result');
        });

        // 6. Vote count update realtime
        newConn.on("VoteUpdated", (data: { voteCounts: VoteCounts }) => {
            setVoteCounts(data.voteCounts);
        });

        newConn.on("PhaseChanged", (data: any) => {
            const phase = (data.phase as string)?.toLowerCase?.();
            if (!phase) return;

            if (phase === 'describing') {
                if (data.turnOrder) setTurnOrder(data.turnOrder);
                if (typeof data.currentTurnIndex === 'number') setCurrentTurnIndex(data.currentTurnIndex);
                setLoadingSync(null);
                setGamePhase('describing');
            }
            if (phase === 'voting') {
                setVoteEndTime(data.voteEndTime ?? Date.now() + 60000);
                setHasVoted(false);
                setMyVoteTarget(null);
                setVoteCounts({});
                setLoadingSync(null);
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

            if (!data.isTieVote && data.eliminatedPlayer) {
                addNotif(`${data.eliminatedPlayer.displayName} bị loại với số phiếu cao nhất.`, 'result');
            } else if (data.isTieVote) {
                addNotif('Hòa phiếu! Không ai bị loại.', 'warning');
            }

            // Update room state players eliminated status
            if (data.eliminatedPlayer) {
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
        });

        // 10. Error
        newConn.on("ErrorMessage", (message: string) => {
            addNotif(message, 'warning');
        });

        // 11. White Hat opportunity
        newConn.on("WhiteHatOpportunity", (data: { pendingWinner: string }) => {
            setPendingWinner(data.pendingWinner);
            setShowWhiteHatGuess(true);
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
                    if (isMounted) {
                        setConnection(newConn);
                        await newConn.invoke("JoinRoom", roomId);
                        await newConn.invoke("GetRoomState", roomId);
                        const pendingLoading = sessionStorage.getItem(`loading:${roomId}`);
                        if (pendingLoading) {
                            sessionStorage.removeItem(`loading:${roomId}`);
                            const parsed = JSON.parse(pendingLoading) as { timeoutSeconds?: number; totalCount?: number; startedAt?: number };
                            const timeoutSeconds = parsed.timeoutSeconds ?? 10;
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
                            setGamePhase('loading');
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
                    }
                } catch (err: any) {
                    if (!err.message?.includes("stopped during negotiation")) {
                        console.error("❌ SignalR Error:", err);
                    }
                }
            }
        };
        start();

        return () => {
            isMounted = false;
            if (newConn.state === HubConnectionState.Connected) newConn.stop();
            userStream.current?.getTracks().forEach(t => t.stop());
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
        role: p.role ?? 'Civilian',
        isEliminated: p.isEliminated ?? false,
        voteCount: voteCounts[p.userId] ?? 0,
        descriptionHistory: p.descriptionHistory ?? [],
    }));

    const playersForDescribing = players.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
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
                {showWhiteHatGuess && (
                    <WhiteHatGuessOverlay
                        isWhiteHat={mySecret?.role === 'WhiteHat'}
                        onGuess={handleWhiteHatGuess}
                        onCancel={() => setShowWhiteHatGuess(false)}
                    />
                )}
                {mySecret?.role === 'WhiteHat' && !isEliminated && !showWhiteHatGuess && (
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
                />
                {/* Chat overlay */}
                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    style={{
                        position: "fixed", bottom: 80, right: 20, zIndex: 60,
                        width: 48, height: 48, borderRadius: "50%", border: "none",
                        background: isChatOpen ? "#e6a822" : "rgba(255,255,255,0.1)",
                        color: isChatOpen ? "#000" : "rgba(255,255,255,0.7)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)", transition: "all 0.2s",
                    }}
                >
                    <MessageSquare size={20} />
                </button>
                <div style={{
                    position: "fixed", bottom: 140, right: 20, width: 340,
                    zIndex: 55, display: isChatOpen ? "block" : "none",
                }}>
                    {connection && (
                        <ChatBox
                            connection={connection}
                            roomId={roomId}
                            currentUser={currentUser || sessionStorage.getItem("username") || "Người chơi"}
                            playerCount={currentPlayerCount}
                        />
                    )}
                </div>
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
                {showWhiteHatGuess && (
                    <WhiteHatGuessOverlay
                        isWhiteHat={mySecret?.role === 'WhiteHat'}
                        onGuess={handleWhiteHatGuess}
                        onCancel={() => setShowWhiteHatGuess(false)}
                    />
                )}
                {mySecret?.role === 'WhiteHat' && !isEliminated && !showWhiteHatGuess && (
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
                    hasVoted={hasVoted}
                    myVoteTarget={myVoteTarget}
                    canSkip={canSkip()}
                    isHost={isHost}
                    isEliminated={isEliminated}
                    onVote={handleVote}
                    onChangeVote={handleChangeVote}
                    onSkip={handleSkipVoting}
                    onTimerExpired={() => {
                        addNotif('Thời gian vote đã hết!', 'warning');
                    }}
                    backgroundImage={backgroundImage}
                />
                {/* Chat */}
                <button
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    style={{
                        position: "fixed", bottom: 24, right: 24, zIndex: 60,
                        width: 48, height: 48, borderRadius: "50%", border: "none",
                        background: isChatOpen ? "#e6a822" : "rgba(255,255,255,0.1)",
                        color: isChatOpen ? "#000" : "rgba(255,255,255,0.7)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.4)", transition: "all 0.2s",
                    }}
                >
                    <MessageSquare size={20} />
                </button>
                <div style={{
                    position: "fixed", bottom: 84, right: 24, width: 340,
                    zIndex: 55, display: isChatOpen ? "block" : "none",
                }}>
                    {connection && (
                        <ChatBox
                            connection={connection}
                            roomId={roomId}
                            currentUser={currentUser || sessionStorage.getItem("username") || "Người chơi"}
                            playerCount={currentPlayerCount}
                        />
                    )}
                </div>
            </>
        );
    }

    // ================================
    // Lobby / default (waiting for game to start)
    // ================================
    const isMyPlayerReady = players.find(p => p.userId === currentUserId)?.isReady ?? false;
    const allReady = players.length >= 3 && players.every(p => p.isReady || p.userId === roomState?.hostId);
    const canStart = isHost && allReady;

    return (
        <div style={pageRootStyle}>
            {overlayElements}
            {leaveRoomButton}
            <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "80px 16px 24px",
                fontFamily: "'Inter', 'Segoe UI', sans-serif",
                position: "relative",
                minHeight: "100vh",
            }}>
                <Notification messages={notifications} />

                {/* ====== SETTINGS PANEL (Host only) ====== */}
                {isHost && (
                    <div style={{
                        width: 320, maxWidth: "100%", marginBottom: 30,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 18, overflow: "hidden",
                        backdropFilter: "blur(12px)",
                    }}>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            style={{
                                width: "100%", padding: "16px 20px",
                                background: "transparent", border: "none",
                                display: "flex", alignItems: "center", gap: 10,
                                cursor: "pointer", color: "#fff",
                                borderBottom: showSettings ? "1px solid rgba(255,255,255,0.07)" : "none",
                            }}
                        >
                            <Settings size={16} style={{ color: "#e6a822" }} />
                            <span style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: "left" }}>Cài đặt phòng</span>
                            {showSettings ? <ChevronUp size={16} style={{ color: "rgba(255,255,255,0.4)" }} /> : <ChevronDown size={16} style={{ color: "rgba(255,255,255,0.4)" }} />}
                        </button>
                        {showSettings && (
                            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                        <Clock size={13} style={{ color: "#22c55e" }} />
                                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Thời gian nói</span>
                                        <span style={{ marginLeft: "auto", color: "#22c55e", fontWeight: 800, fontSize: 13 }}>{localSettings.describeDuration}s</span>
                                    </div>
                                    <input type="range" min={15} max={60} step={5} value={localSettings.describeDuration} onChange={e => handleUpdateSettings({ describeDuration: Number(e.target.value) })} style={{ width: "100%", accentColor: "#22c55e" }} />
                                </div>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                        <Vote size={13} style={{ color: "#e6a822" }} />
                                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Thời gian vote</span>
                                        <span style={{ marginLeft: "auto", color: "#e6a822", fontWeight: 800, fontSize: 13 }}>{localSettings.voteDuration}s</span>
                                    </div>
                                    <input type="range" min={30} max={90} step={15} value={localSettings.voteDuration} onChange={e => handleUpdateSettings({ voteDuration: Number(e.target.value) })} style={{ width: "100%", accentColor: "#e6a822" }} />
                                </div>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                        <Clock size={13} style={{ color: "#6366f1" }} />
                                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Chờ giữa vòng</span>
                                        <span style={{ marginLeft: "auto", color: "#6366f1", fontWeight: 800, fontSize: 13 }}>{localSettings.roundTransitionDuration}s</span>
                                    </div>
                                    <input type="range" min={5} max={10} step={1} value={localSettings.roundTransitionDuration} onChange={e => handleUpdateSettings({ roundTransitionDuration: Number(e.target.value) })} style={{ width: "100%", accentColor: "#6366f1" }} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SECRET WORD DISPLAY (Only when game starts/roles are revealed) ── */}
                {mySecret && (
                    <div style={{ marginBottom: 40, textAlign: "center" }}>
                        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", margin: "0 0 10px" }}>
                            Từ khóa bí mật
                        </p>
                        <div
                            onClick={() => setIsChatOpen(p => p)}
                            style={{
                                background: "rgba(0,0,0,0.4)",
                                border: "2px solid rgba(230,168,34,0.2)",
                                borderRadius: 50, padding: "12px 32px",
                                color: "#e6a822", fontWeight: 900, fontSize: 20,
                                letterSpacing: "0.15em", cursor: "pointer",
                                minWidth: 240, textAlign: "center",
                                boxShadow: "0 0 20px rgba(230,168,34,0.08)",
                            }}
                        >
                            <span style={{ animation: "pulse 2s infinite" }}>{mySecret.word}</span>
                        </div>
                    </div>
                )}

                {/* ── PLAYER GRID ── */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    gap: 14, width: "100%", maxWidth: 900,
                }}>
                    {players.map(player => (
                        <div key={player.userId} style={{
                            background: player.isEliminated ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.04)",
                            border: player.isEliminated
                                ? "1px solid rgba(239,68,68,0.15)"
                                : player.userId === currentUserId
                                    ? "1px solid rgba(230,168,34,0.3)"
                                    : "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 18, padding: "18px 14px",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                            filter: player.isEliminated ? "grayscale(60%)" : "none",
                            opacity: player.isEliminated ? 0.6 : 1,
                            position: "relative",
                            transition: "all 0.3s",
                        }}>
                            {player.userId === roomState?.hostId && (
                                <div style={{
                                    position: "absolute", top: 8, right: 8,
                                    color: "#e6a822",
                                }}>
                                    <Shield size={14} fill="currentColor" />
                                </div>
                            )}

                            {/* Avatar */}
                            <div style={{
                                width: 52, height: 52, borderRadius: "50%",
                                background: player.userId === currentUserId
                                    ? "radial-gradient(circle at 35% 35%, rgba(230,168,34,0.3), #0a0a14)"
                                    : "radial-gradient(circle at 35% 35%, rgba(99,102,241,0.2), #0a0a14)",
                                border: `2px solid ${player.userId === currentUserId ? "rgba(230,168,34,0.5)" : "rgba(99,102,241,0.3)"}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 18, fontWeight: 900,
                                color: player.userId === currentUserId ? "#e6a822" : "#6366f1",
                            }}>
                                {player.displayName?.charAt(0)?.toUpperCase() || "?"}
                            </div>

                            <div style={{ textAlign: "center" }}>
                                <div style={{
                                    color: player.userId === currentUserId ? "#e6a822" : "#fff",
                                    fontWeight: 700, fontSize: 13,
                                    maxWidth: 130, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {player.displayName}
                                </div>
                                {player.userId === currentUserId && (
                                    <div style={{ color: "rgba(230,168,34,0.6)", fontSize: 10, marginTop: 2 }}>(Bạn)</div>
                                )}
                            </div>

                            {player.isEliminated && (
                                <span style={{ fontSize: 18 }}>❌</span>
                            )}

                            {/* Ready Status (only show in lobby before game starts) */}
                            {!mySecret && !player.isEliminated && (
                                player.isReady ? (
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 5,
                                        background: "rgba(34,197,94,0.12)",
                                        border: "1px solid rgba(34,197,94,0.3)",
                                        color: "#22c55e", padding: "4px 12px", borderRadius: 99,
                                        fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                                    }}>
                                        <CheckCircle2 size={12} /> SẴN SÀNG
                                    </div>
                                ) : (
                                    <div style={{
                                        color: "rgba(255,255,255,0.25)",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.07)",
                                        padding: "4px 12px", borderRadius: 99,
                                        fontSize: 11, fontWeight: 600,
                                    }}>
                                        Đang chờ...
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>

                {/* ====== BOTTOM ACTIONS ====== */}
                {!mySecret && (
                    <div style={{
                        position: "fixed", bottom: 0, left: 0, right: 0,
                        padding: "20px 24px",
                        background: "linear-gradient(to top, rgba(10,10,20,0.98) 0%, rgba(10,10,20,0.8) 70%, transparent 100%)",
                        display: "flex", justifyContent: "center", gap: 12,
                        zIndex: 50,
                    }}>
                        {!isHost && (
                            <button
                                onClick={() => connection?.invoke("ToggleReady", !isMyPlayerReady)}
                                style={{
                                    padding: "14px 40px", borderRadius: 14,
                                    fontWeight: 900, fontSize: 15, cursor: "pointer",
                                    letterSpacing: "0.08em", border: "none",
                                    transition: "all 0.2s", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                    background: isMyPlayerReady
                                        ? "rgba(255,255,255,0.07)"
                                        : "linear-gradient(135deg, #22c55e, #16a34a)",
                                    color: isMyPlayerReady ? "rgba(255,255,255,0.5)" : "#fff",
                                    borderTop: isMyPlayerReady ? "1px solid rgba(255,255,255,0.08)" : "none",
                                }}
                                onMouseEnter={e => !isMyPlayerReady && ((e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)")}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"}
                            >
                                {isMyPlayerReady ? "✖ HỦY SẴN SÀNG" : "✓ SẴN SÀNG"}
                            </button>
                        )}

                        {isHost && (
                            <button
                                onClick={async () => {
                                    if (!connection) return;
                                    try { await connection.invoke("StartGame"); }
                                    catch (err) { console.error("StartGame error:", err); }
                                }}
                                disabled={!canStart}
                                style={{
                                    padding: "14px 48px", borderRadius: 14,
                                    fontWeight: 900, fontSize: 15, cursor: canStart ? "pointer" : "not-allowed",
                                    letterSpacing: "0.08em", border: "none",
                                    transition: "all 0.2s",
                                    background: canStart
                                        ? "linear-gradient(135deg, #e6a822, #d4941a)"
                                        : "rgba(255,255,255,0.05)",
                                    color: canStart ? "#000" : "rgba(255,255,255,0.2)",
                                    boxShadow: canStart ? "0 8px 32px rgba(230,168,34,0.35)" : "none",
                                }}
                                onMouseEnter={e => canStart && ((e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)")}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"}
                            >
                                BẮT ĐẦU GAME
                            </button>
                        )}
                    </div>
                )}

                {/* ── VOICE CONTROLS ── */}
                {isJoinedVoice && (
                    <div style={{
                        position: "fixed", bottom: 24, right: 24,
                        display: "flex", alignItems: "center", gap: 10, zIndex: 50,
                    }}>
                        <div style={{
                            display: "flex", gap: 8,
                            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            padding: "8px 12px", borderRadius: 99,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                        }}>
                            <button
                                onClick={toggleSpeaker}
                                style={{
                                    width: 42, height: 42, borderRadius: "50%", border: "none",
                                    background: isSpeakerOn ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.06)",
                                    color: isSpeakerOn ? "#6366f1" : "rgba(255,255,255,0.3)",
                                    cursor: "pointer", fontSize: 18,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.2s",
                                }}
                            >
                                {isSpeakerOn ? "🔊" : "🔇"}
                            </button>
                            <button
                                onClick={toggleMic}
                                style={{
                                    width: 42, height: 42, borderRadius: "50%", border: "none",
                                    background: isMicOn ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.1)",
                                    color: isMicOn ? "#ef4444" : "#22c55e",
                                    cursor: "pointer", fontSize: 18,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.2s",
                                }}
                            >
                                {isMicOn ? "🎙️" : "🚫"}
                            </button>
                        </div>

                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            style={{
                                width: 52, height: 52, borderRadius: "50%", border: "none",
                                background: isChatOpen ? "#e6a822" : "rgba(255,255,255,0.08)",
                                color: isChatOpen ? "#000" : "rgba(255,255,255,0.6)",
                                cursor: "pointer", fontSize: 20,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: isChatOpen ? "0 4px 20px rgba(230,168,34,0.4)" : "0 4px 16px rgba(0,0,0,0.4)",
                                transition: "all 0.2s",
                            }}
                        >
                            {isChatOpen ? "✖" : "💬"}
                        </button>
                    </div>
                )}

                {!isJoinedVoice && (
                    <div style={{
                        position: "fixed", bottom: 24, right: 24,
                        background: "rgba(0,0,0,0.5)", borderRadius: 99, padding: "8px 16px",
                        color: "rgba(255,255,255,0.3)", fontSize: 12,
                        animation: "pulse-opacity 1.5s ease-in-out infinite",
                    }}>
                        <style>{`@keyframes pulse-opacity { 0%,100%{opacity:0.5;} 50%{opacity:1;} }`}</style>
                        🎤 Đang kết nối voice...
                    </div>
                )}

                {/* Chat box */}
                <div style={{
                    position: "fixed", bottom: 90, right: 24, width: 340,
                    zIndex: 55, display: isChatOpen ? "block" : "none",
                }}>
                    {connection && (
                        <ChatBox
                            connection={connection}
                            roomId={roomId}
                            currentUser={currentUser || sessionStorage.getItem("username") || "Người chơi"}
                            playerCount={currentPlayerCount}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper — move outside component to avoid recreation
function canSkip() { return true; } // Logic thực sẽ do server control
