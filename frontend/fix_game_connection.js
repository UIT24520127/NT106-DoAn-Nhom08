const fs = require('fs');

const path = 'app/game/[roomId]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace connection creation
content = content.replace(
    /const newConn = new HubConnectionBuilder\(\)[\s\S]*?\.build\(\);/,
    `const newConn = getSignalRConnection(getToken() || "");`
);

// Add import if needed
if (!content.includes('getSignalRConnection')) {
    content = content.replace(
        /import { getSignalRConnection } from "@\/lib\/signalRConnection";\n?/,
        ''
    );
    content = content.replace(
        /import \{ useParams, useRouter \} from "next\/navigation";/,
        `import { useParams, useRouter } from "next/navigation";\nimport { getSignalRConnection } from "@/lib/signalRConnection";`
    );
}

// Replace the start() function
const startRegex = /const start = async \(\) => \{[\s\S]*?\};[\s\n]*start\(\);/;

const newStartFunc = `        const start = async () => {
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
                    const pendingLoading = sessionStorage.getItem(\`loading:\${roomId}\`);
                    if (pendingLoading) {
                        sessionStorage.removeItem(\`loading:\${roomId}\`);
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
        start();`;

content = content.replace(startRegex, newStartFunc);

const events = [
    "RoomJoined", "RoomError", "KickedFromRoom", "RoomUpdated",
    "UserJoinedVoice", "ReceiveSignal", "PlayerDisconnected",
    "ReceiveSecretWord", "RoleAssigned", "ReturnedToLobby",
    "LoadingPhaseStarted", "LoadingProgressUpdated", "SwitchedToSpectator",
    "SpectatorUpdated", "GameStarted", "AllPlayersReady",
    "TurnOrderGenerated", "TurnStarted", "TurnEnded", "TurnSkipped",
    "DescriptionSubmitted", "VotingStarted", "VoteUpdated", "PhaseChanged",
    "RoundTransitionStarted", "PlayerEliminated", "GameEnded",
    "ErrorMessage", "WhiteHatOpportunity", "RoundStarted"
];

const offCalls = events.map(e => `            newConn.off('${e}');`).join('\n');

const cleanupRegex = /return \(\) => \{[\s\n]*isMounted = false;[\s\S]*?userStream\.current\?\.getTracks\(\)\.forEach\(t => t\.stop\(\)\);[\s\n]*\};/;

const newCleanup = `        return () => {
            isMounted = false;
${offCalls}
            userStream.current?.getTracks().forEach(t => t.stop());
        };`;

content = content.replace(cleanupRegex, newCleanup);

fs.writeFileSync(path, content);
console.log("Done");
