// Quản lý âm lượng NHẠC NỀN (BGM) + HIỆU ỨNG (SFX) dùng chung toàn app.
// Lưu vào localStorage, áp dụng tức thì cho các thẻ <audio> nhạc.
// LƯU Ý: KHÔNG đụng tới mic/voice (các thẻ audio-{peerId} của WebRTC) — voice điều khiển riêng.

const BGM_KEY = "vol_bgm";
const SFX_KEY = "vol_sfx";

// Các thẻ nhạc nền do soundSettings điều khiển (KHÔNG gồm audio voice)
const BGM_IDS = ["sound-bgm", "sound-bgm-game"];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function read(key: string, def: number): number {
    if (typeof window === "undefined") return def;
    const raw = window.localStorage.getItem(key);
    const v = raw === null ? def : parseFloat(raw);
    return Number.isNaN(v) ? def : clamp01(v);
}

let bgmVolume = read(BGM_KEY, 0.3); // mặc định nhạc nền nhỏ
let sfxVolume = read(SFX_KEY, 0.7); // hiệu ứng to hơn chút

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSound(l: () => void) {
    listeners.add(l);
    return () => { listeners.delete(l); };
}

export const getBgmVolume = () => bgmVolume;
export const getSfxVolume = () => sfxVolume;

/** Áp âm lượng BGM cho các thẻ nhạc nền đang tồn tại (nghe thay đổi ngay khi kéo slider). */
function applyBgmLive() {
    if (typeof document === "undefined") return;
    for (const id of BGM_IDS) {
        const a = document.getElementById(id) as HTMLAudioElement | null;
        if (a) a.volume = bgmVolume;
    }
}

export function setBgmVolume(v: number) {
    bgmVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(BGM_KEY, String(bgmVolume));
    applyBgmLive();
    notify();
}

export function setSfxVolume(v: number) {
    sfxVolume = clamp01(v);
    if (typeof window !== "undefined") window.localStorage.setItem(SFX_KEY, String(sfxVolume));
    notify();
}
