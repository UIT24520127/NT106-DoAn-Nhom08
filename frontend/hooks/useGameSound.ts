import { useMemo } from "react";
import { 
    getMenuBgmVolume, getGameBgmVolume, 
    getSfxUiVolume, getSfxLobbyVolume, getSfxGameplayVolume, getSfxEndgameVolume 
} from "@/lib/soundSettings";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const useGameSound = () => {
    return useMemo(() => {
        // playGlobalSound giờ nhận thêm tham số sfxVolume để biết đang phát theo category nào
        const playGlobalSound = (id: string, sfxVolume: number, base: number = 0.5) => {
            if (typeof document === "undefined") return;
            const audio = document.getElementById(id) as HTMLAudioElement | null;
            if (!audio) return;
            audio.volume = clamp01(sfxVolume * base);
            audio.currentTime = 0;
            audio.play().catch(() => { /* bỏ qua AbortError/autoplay */ });
        };

        const toggleMenuBGM = (play: boolean) => {
            if (typeof document === "undefined") return;
            const audio = document.getElementById("sound-bgm") as HTMLAudioElement | null;
            if (!audio) return;
            if (play) {
                audio.volume = getMenuBgmVolume();
                if (audio.paused) audio.play().catch(() => { /* bỏ qua */ });
            } else {
                audio.pause();
                audio.currentTime = 0;
            }
        };

        const toggleGameBGM = (play: boolean) => {
            if (typeof document === "undefined") return;
            const audio = document.getElementById("sound-bgm-game") as HTMLAudioElement | null;
            if (!audio) return;
            if (play) {
                audio.volume = getGameBgmVolume();
                if (audio.paused) audio.play().catch(() => { /* bỏ qua */ });
            } else {
                audio.pause();
                audio.currentTime = 0;
            }
        };

        return {
            // UI & System
            playClick: () => playGlobalSound("sound-click", getSfxUiVolume(), 0.5),
            playAlert: () => playGlobalSound("sound-alert", getSfxUiVolume(), 0.5),
            
            // Lobby & Matchmaking
            playReady: () => playGlobalSound("sound-ready", getSfxLobbyVolume(), 0.5),
            playStart: () => playGlobalSound("sound-start", getSfxLobbyVolume(), 0.8),
            
            // Gameplay
            playVote: () => playGlobalSound("sound-vote", getSfxGameplayVolume(), 0.5),
            playCountdown5s: () => playGlobalSound("sound-countdown5s", getSfxGameplayVolume(), 0.8),
            playCountdown10s: () => playGlobalSound("sound-countdown10s", getSfxGameplayVolume(), 0.8),
            playLoai: () => playGlobalSound("sound-loai", getSfxGameplayVolume(), 0.8),
            
            // Endgame
            playWin: () => playGlobalSound("sound-win", getSfxEndgameVolume(), 0.8),
            playLose: () => playGlobalSound("sound-lose", getSfxEndgameVolume(), 0.8),
            
            // BGM
            playBGM: () => toggleMenuBGM(true),
            stopBGM: () => toggleMenuBGM(false),
            playGameBGM: () => toggleGameBGM(true),
            stopGameBGM: () => toggleGameBGM(false),
        };
    }, []);
};
