export const useGameSound = () => {
    const playGlobalSound = (id: string, volume: number = 0.5) => {
        if (typeof document === 'undefined') return;
        const audio = document.getElementById(id) as HTMLAudioElement;

        if (audio) {
            audio.volume = volume;
            audio.currentTime = 0; // Tua lại từ đầu
            audio.play().catch(e => console.warn(`Không thể phát âm thanh ${id}:`, e));
        }
    };

    const toggleBGM = (id: string, play: boolean, volume: number = 0.3) => {
        if (typeof document === 'undefined') return;
        const audio = document.getElementById(id) as HTMLAudioElement;
        if (audio) {
            if (play) {
                audio.volume = volume;
                if (audio.paused) {
                    audio.play().catch(e => console.warn(`Không thể phát BGM ${id}:`, e));
                }
            } else {
                audio.pause();
                // Không tua lại từ đầu để tiếp tục lúc sau, hoặc tua lại nếu muốn
            }
        }
    };

    return {
        playClick: () => playGlobalSound('sound-click', 0.5),
        playReady: () => playGlobalSound('sound-ready', 0.5),
        playStart: () => playGlobalSound('sound-start', 0.8),
        playVote: () => playGlobalSound('sound-vote', 0.5),
        playAlert: () => playGlobalSound('sound-alert', 0.5),
        playTick: () => playGlobalSound('sound-tick', 0.8), // Đếm ngược
        playWin: () => playGlobalSound('sound-win', 0.8),   // Thắng
        playLose: () => playGlobalSound('sound-lose', 0.8), // Bị loại / Thua
        playBGM: () => toggleBGM('sound-bgm', true, 0.15), // <-- Thay đổi ở đây (0.0 đến 1.0)
        stopBGM: () => toggleBGM('sound-bgm', false),
        playGameBGM: () => toggleBGM('sound-bgm-game', true, 0.2), // Nhạc trong game, âm lượng 20%
        stopGameBGM: () => toggleBGM('sound-bgm-game', false),
    };
};
