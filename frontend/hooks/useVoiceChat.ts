import { useEffect, useRef, useState, useCallback } from 'react';
import { HubConnection } from '@microsoft/signalr';
import { getVoiceOutputVolume, subscribeSound } from "@/lib/soundSettings";

type PeerInstance = any;

export function useVoiceChat(connection: HubConnection | null, roomId: string | null) {
    const [isMicOn, setIsMicOn] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [isJoinedVoice, setIsJoinedVoice] = useState(false);

    const userStream = useRef<MediaStream | null>(null);
    const peers = useRef<Record<string, PeerInstance>>({});
    const remoteAudios = useRef<Record<string, HTMLAudioElement>>({});
    const peerCtorRef = useRef<any>(null);
    const myVoiceId = useRef<string>('');
    const joinedVoiceRef = useRef<boolean>(false);

    // Lắng nghe thay đổi âm lượng voice output
    useEffect(() => {
        const updateVoiceVols = () => {
            const vol = getVoiceOutputVolume();
            Object.values(remoteAudios.current).forEach(audio => {
                audio.volume = vol;
            });
        };
        updateVoiceVols();
        return subscribeSound(updateVoiceVols);
    }, []);

    const cleanupPeer = useCallback((id: string) => {
        if (peers.current[id]) { peers.current[id].destroy(); delete peers.current[id]; }
        if (remoteAudios.current[id]) { remoteAudios.current[id].remove(); delete remoteAudios.current[id]; }
    }, []);

    const createPeer = useCallback((targetId: string, conn: HubConnection, initiator: boolean): PeerInstance | null => {
        const Peer = peerCtorRef.current;
        if (!Peer) { console.warn('[VOICE] simple-peer chưa sẵn sàng'); return null; }
        const hasStream = !!userStream.current;
        console.log(`[VOICE] createPeer -> ${targetId} | initiator=${initiator} | có mic stream=${hasStream}`);
        const peer = new Peer({
            initiator,
            trickle: true,
            stream: userStream.current || undefined,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun.relay.metered.ca:80' },
                    { urls: 'turn:global.relay.metered.ca:80', username: '3525f89d123fedefe6b73999', credential: 'ujhX7qeJ/CMcPQuC' },
                    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '3525f89d123fedefe6b73999', credential: 'ujhX7qeJ/CMcPQuC' },
                    { urls: 'turn:global.relay.metered.ca:443', username: '3525f89d123fedefe6b73999', credential: 'ujhX7qeJ/CMcPQuC' },
                    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '3525f89d123fedefe6b73999', credential: 'ujhX7qeJ/CMcPQuC' },
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
    }, [isSpeakerOn, cleanupPeer]);

    const connectToPeer = useCallback((otherId: string, conn: HubConnection) => {
        if (!otherId || peers.current[otherId]) {
            console.log(`[VOICE] bỏ qua connectToPeer ${otherId} (đã có peer hoặc rỗng)`);
            return;
        }
        const myId = myVoiceId.current || conn.connectionId || '';
        const initiator = myId > otherId;
        console.log(`[VOICE] connectToPeer ${otherId} | myId=${myId} | làm initiator=${initiator}`);
        const peer = createPeer(otherId, conn, initiator);
        if (peer) peers.current[otherId] = peer;
    }, [createPeer]);

    const joinVoiceChat = useCallback(async (activeConn: HubConnection) => {
        if (!roomId) return;
        if (joinedVoiceRef.current) { console.log('[VOICE] joinVoiceChat: đã vào rồi, bỏ qua'); return; }
        joinedVoiceRef.current = true;
        try {
            console.log('[VOICE] joinVoiceChat: bắt đầu...');
            if (!peerCtorRef.current) peerCtorRef.current = (await import('simple-peer')).default;
            if (!userStream.current) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
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
    }, [roomId]);

    const leaveVoice = useCallback((conn?: HubConnection | null) => {
        const c = conn || connection;
        if (roomId) {
            try { c?.invoke("LeaveVoiceChat", roomId); } catch { /* ignore */ }
        }
        Object.keys(peers.current).forEach(id => cleanupPeer(id));
        userStream.current?.getTracks().forEach(t => t.stop());
        userStream.current = null;
        joinedVoiceRef.current = false;
        myVoiceId.current = '';
        console.log('[VOICE] 🔌 rời voice: đã destroy peers + tắt mic + báo server');
    }, [connection, roomId, cleanupPeer]);

    const toggleMic = useCallback(() => {
        if (!userStream.current) { console.warn('[VOICE] toggleMic: chưa có mic stream'); return; }
        const newState = !isMicOn;
        userStream.current.getAudioTracks().forEach(t => t.enabled = newState);
        setIsMicOn(newState);
        console.log(`[VOICE] 🎙️ Mic ${newState ? 'BẬT' : 'TẮT'} | số peer đang kết nối=${Object.keys(peers.current).length}`);
        Object.values(remoteAudios.current).forEach(a => a.play().catch(() => {}));
    }, [isMicOn]);

    const toggleSpeaker = useCallback(() => {
        const newState = !isSpeakerOn;
        setIsSpeakerOn(newState);
        Object.values(remoteAudios.current).forEach(audio => {
            audio.muted = !newState;
            if (newState) audio.play().catch(() => {});
        });
        console.log(`[VOICE] 🔊 Loa ${newState ? 'BẬT' : 'TẮT'} | số audio remote=${Object.keys(remoteAudios.current).length}`);
    }, [isSpeakerOn]);

    // Setup SignalR events
    useEffect(() => {
        if (!connection) return;

        const handleExistingUsers = (data: { selfId: string; users: string[] }) => {
            myVoiceId.current = data?.selfId || '';
            console.log('[VOICE] 📥 ExistingVoiceUsers | selfId=', data?.selfId, '| users=', data?.users);
            (data?.users || []).forEach(id => connectToPeer(id, connection));
        };

        const handleNewUser = (newcomerId: string) => {
            console.log('[VOICE] 📥 UserJoinedVoice:', newcomerId);
            connectToPeer(newcomerId, connection);
        };

        const handleSignal = (senderId: string, signal: string) => {
            console.log(`[VOICE] 📥 ReceiveSignal từ ${senderId}`);
            let peer = peers.current[senderId];
            if (!peer) {
                console.log(`[VOICE] chưa có peer cho ${senderId} -> tạo non-initiator`);
                peer = createPeer(senderId, connection, false);
                if (peer) peers.current[senderId] = peer;
            }
            if (peer) { try { peer.signal(JSON.parse(signal)); } catch (e) { console.error('[VOICE] signal lỗi:', e); } }
        };

        const handleDisconnect = (id: string) => {
            console.log('[VOICE] 📥 PlayerDisconnected:', id);
            cleanupPeer(id);
        };

        connection.on('ExistingVoiceUsers', handleExistingUsers);
        connection.on('UserJoinedVoice', handleNewUser);
        connection.on('ReceiveSignal', handleSignal);
        connection.on('PlayerDisconnected', handleDisconnect);

        return () => {
            connection.off('ExistingVoiceUsers', handleExistingUsers);
            connection.off('UserJoinedVoice', handleNewUser);
            connection.off('ReceiveSignal', handleSignal);
            connection.off('PlayerDisconnected', handleDisconnect);
        };
    }, [connection, connectToPeer, createPeer, cleanupPeer]);

    // Update speaker status if it changes
    useEffect(() => {
        Object.values(remoteAudios.current).forEach(audio => {
            audio.muted = !isSpeakerOn;
        });
    }, [isSpeakerOn]);

    return {
        isMicOn,
        isSpeakerOn,
        isJoinedVoice,
        joinVoiceChat,
        leaveVoice,
        toggleMic,
        toggleSpeaker
    };
}
