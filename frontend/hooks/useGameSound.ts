import { useMemo } from "react";
import { getBgmVolume, getSfxVolume } from "@/lib/soundSettings";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const useGameSound = () => {
    // useMemo([]) -> trả về CÙNG một object hàm qua mọi lần render -> useEffect phụ thuộc
    // các hàm này KHÔNG bị chạy lại liên tục (tránh play()/pause() dồn dập -> AbortError).
    return useMemo(() => {
        // Hiệu ứng: âm lượng = master SFX * base (giữ tương quan to/nhỏ giữa các tiếng)
        const playGlobalSound = (id: string, base: number = 0.5) => {
            if (typeof document === "undefined") return;
            const audio = document.getElementById(id) as HTMLAudioElement | null;
            if (!audio) return;
            audio.volume = clamp01(getSfxVolume() * base);
            audio.currentTime = 0;
            audio.play().catch(() => { /* bỏ qua AbortError/autoplay */ });
        };

        // Nhạc nền: âm lượng = master BGM (trực tiếp 0..1)
        const toggleBGM = (id: string, play: boolean) => {
            if (typeof document === "undefined") return;
            const audio = document.getElementById(id) as HTMLAudioElement | null;
            if (!audio) return;
            if (play) {
                audio.volume = getBgmVolume();
                if (audio.paused) audio.play().catch(() => { /* bỏ qua */ });
            } else {
                audio.pause();
                audio.currentTime = 0; // RESET về đầu -> lần phát sau bắt đầu lại từ đầu
            }
        };

        return {
            playClick: () => playGlobalSound("sound-click", 0.5),
            playReady: () => playGlobalSound("sound-ready", 0.5),
            playStart: () => playGlobalSound("sound-start", 0.8),
            playVote: () => playGlobalSound("sound-vote", 0.5),
            playAlert: () => playGlobalSound("sound-alert", 0.5),
            playTick: () => playGlobalSound("sound-tick", 0.8),
            playWin: () => playGlobalSound("sound-win", 0.8),
            playLose: () => playGlobalSound("sound-lose", 0.8),
            playBGM: () => toggleBGM("sound-bgm", true),
            stopBGM: () => toggleBGM("sound-bgm", false),
            playGameBGM: () => toggleBGM("sound-bgm-game", true),
            stopGameBGM: () => toggleBGM("sound-bgm-game", false),
        };
    }, []);
};
