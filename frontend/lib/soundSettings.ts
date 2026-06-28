// Quản lý âm lượng NHẠC NỀN cho MENU và GAME cùng với HIỆU ỨNG (SFX) dùng chung toàn app.
// Lưu vào localStorage, áp dụng tức thì cho các thẻ <audio> nhạc.
// LƯU Ý: KHÔNG đụng tới mic/voice (các thẻ audio-{peerId} của WebRTC) — voice điều khiển riêng.

const MENU_BGM_KEY = "vol_menu_bgm";
const GAME_BGM_KEY = "vol_game_bgm";
const SFX_KEY = "vol_sfx";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function read(key: string, def: number): number {
    if (typeof window === "undefined") return def;
    const raw = window.localStorage.getItem(key);
    const v = raw === null ? def : parseFloat(raw);
    return Number.isNaN(v) ? def : clamp01(v);
}

let menuBgmVolume = read(MENU_BGM_KEY, 0.3); // mặc định nhạc nền nhỏ
let gameBgmVolume = read(GAME_BGM_KEY, 0.3); // mặc định nhạc nền game nhỏ
let sfxVolume = read(SFX_KEY, 0.7); // hiệu ứng to hơn chút

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSound(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

export const getMenuBgmVolume = () => menuBgmVolume;
export const getGameBgmVolume = () => gameBgmVolume;
export const getSfxVolume = () => sfxVolume;

/** Áp âm lượng BGM cho các thẻ nhạc nền đang tồn tại (nghe thay đổi ngay khi kéo slider). */
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

export function setSfxVolume(v: number) {
    sfxVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_KEY, String(sfxVolume));
    notify();
}
