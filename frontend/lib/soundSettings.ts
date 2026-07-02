// Quản lý âm lượng NHẠC NỀN cho MENU và GAME cùng với HIỆU ỨNG (SFX) dùng chung toàn app.
// Lưu vào localStorage, áp dụng tức thì cho các thẻ <audio> nhạc.
// LƯU Ý: KHÔNG đụng tới mic/voice (các thẻ audio-{peerId} của WebRTC) — voice điều khiển riêng.

const MENU_BGM_KEY = "vol_menu_bgm";
const GAME_BGM_KEY = "vol_game_bgm";
const SFX_UI_KEY = "vol_sfx_ui";
const SFX_LOBBY_KEY = "vol_sfx_lobby";
const SFX_GAMEPLAY_KEY = "vol_sfx_gameplay";
const SFX_ENDGAME_KEY = "vol_sfx_endgame";
const MIC_VOL_KEY = "vol_mic";
const VOICE_OUTPUT_KEY = "vol_voice_output";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function read(key: string, def: number): number {
    if (typeof window === "undefined") return def;
    const raw = window.localStorage.getItem(key);
    const v = raw === null ? def : parseFloat(raw);
    return Number.isNaN(v) ? def : clamp01(v);
}

let menuBgmVolume = read(MENU_BGM_KEY, 0.3); 
let gameBgmVolume = read(GAME_BGM_KEY, 0.3); 
let sfxUiVolume = read(SFX_UI_KEY, 0.3); 
let sfxLobbyVolume = read(SFX_LOBBY_KEY, 0.3); 
let sfxGameplayVolume = read(SFX_GAMEPLAY_KEY, 0.3); 
let sfxEndgameVolume = read(SFX_ENDGAME_KEY, 0.3); 
let micVolume = read(MIC_VOL_KEY, 1.0); 
let voiceOutputVolume = read(VOICE_OUTPUT_KEY, 1.0); 

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSound(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

export const getMenuBgmVolume = () => menuBgmVolume;
export const getGameBgmVolume = () => gameBgmVolume;
export const getSfxUiVolume = () => sfxUiVolume;
export const getSfxLobbyVolume = () => sfxLobbyVolume;
export const getSfxGameplayVolume = () => sfxGameplayVolume;
export const getSfxEndgameVolume = () => sfxEndgameVolume;
export const getMicVolume = () => micVolume;
export const getVoiceOutputVolume = () => voiceOutputVolume;

function applyMenuBgmLive() {
    if (typeof document === "undefined") return;
    const a = document.getElementById("sound-bgm") as HTMLAudioElement | null;
    if (a) a.volume = menuBgmVolume;
}

function applyGameBgmLive() {
    if (typeof document === "undefined") return;
    const a = document.getElementById("sound-bgm-game") as HTMLAudioElement | null;
    if (a) a.volume = gameBgmVolume;
}

function applySfxGameplayLive() {
    if (typeof document === "undefined") return;
    const a5 = document.getElementById("sound-countdown5s") as HTMLAudioElement | null;
    if (a5 && !a5.paused) a5.volume = clamp01(sfxGameplayVolume * 0.8);
    const a10 = document.getElementById("sound-countdown10s") as HTMLAudioElement | null;
    if (a10 && !a10.paused) a10.volume = clamp01(sfxGameplayVolume * 0.8);
    const aVote = document.getElementById("sound-vote") as HTMLAudioElement | null;
    if (aVote && !aVote.paused) aVote.volume = clamp01(sfxGameplayVolume * 0.5);
    const aLoai = document.getElementById("sound-loai") as HTMLAudioElement | null;
    if (aLoai && !aLoai.paused) aLoai.volume = clamp01(sfxGameplayVolume * 0.8);
}

// BGM Setters
export function setMenuBgmVolume(v: number) {
    menuBgmVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(MENU_BGM_KEY, String(menuBgmVolume));
    applyMenuBgmLive();
    notify();
}
export function setGameBgmVolume(v: number) {
    gameBgmVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(GAME_BGM_KEY, String(gameBgmVolume));
    applyGameBgmLive();
    notify();
}

// SFX Setters
export function setSfxUiVolume(v: number) {
    sfxUiVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_UI_KEY, String(sfxUiVolume));
    notify();
}
export function setSfxLobbyVolume(v: number) {
    sfxLobbyVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_LOBBY_KEY, String(sfxLobbyVolume));
    notify();
}
export function setSfxGameplayVolume(v: number) {
    sfxGameplayVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_GAMEPLAY_KEY, String(sfxGameplayVolume));
    applySfxGameplayLive();
    notify();
}
export function setSfxEndgameVolume(v: number) {
    sfxEndgameVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_ENDGAME_KEY, String(sfxEndgameVolume));
    notify();
}

// Voice Setters
export function setMicVolume(v: number) {
    micVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(MIC_VOL_KEY, String(micVolume));
    notify();
}
export function setVoiceOutputVolume(v: number) {
    voiceOutputVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(VOICE_OUTPUT_KEY, String(voiceOutputVolume));
    notify();
}

// Lắng nghe thay đổi từ các tab khác (khi mở nhiều tab để test)
if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
        if (!e.key || e.newValue === null) return;
        const val = parseFloat(e.newValue);
        if (Number.isNaN(val)) return;
        
        switch (e.key) {
            case MENU_BGM_KEY: menuBgmVolume = clamp01(val); applyMenuBgmLive(); break;
            case GAME_BGM_KEY: gameBgmVolume = clamp01(val); applyGameBgmLive(); break;
            case SFX_UI_KEY: sfxUiVolume = clamp01(val); break;
            case SFX_LOBBY_KEY: sfxLobbyVolume = clamp01(val); break;
            case SFX_GAMEPLAY_KEY: sfxGameplayVolume = clamp01(val); applySfxGameplayLive(); break;
            case SFX_ENDGAME_KEY: sfxEndgameVolume = clamp01(val); break;
            case MIC_VOL_KEY: micVolume = clamp01(val); break;
            case VOICE_OUTPUT_KEY: voiceOutputVolume = clamp01(val); break;
        }
        notify();
    });
}

