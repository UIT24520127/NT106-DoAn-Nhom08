"use client";
import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX, ChevronRight, ChevronLeft } from "lucide-react";
import {
    getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume, subscribeSound,
} from "@/lib/soundSettings";

// Thanh chỉnh âm lượng NHẠC + HIỆU ỨNG, đặt giữa-trái. KHÔNG ảnh hưởng mic/voice.
export default function VolumeControl() {
    const [open, setOpen] = useState(false);
    const [bgm, setBgm] = useState(0.3);
    const [sfx, setSfx] = useState(0.7);

    useEffect(() => {
        setBgm(getBgmVolume());
        setSfx(getSfxVolume());
        return subscribeSound(() => { setBgm(getBgmVolume()); setSfx(getSfxVolume()); });
    }, []);

    return (
        <div
            style={{ position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 60 }}
            className="flex items-center"
        >
            {/* Panel slider */}
            <div
                className="overflow-hidden transition-all duration-300 bg-black/55 backdrop-blur-xl border border-white/10 border-l-0 rounded-r-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                style={{ width: open ? 190 : 0, opacity: open ? 1 : 0 }}
            >
                <div className="px-4 py-3 flex flex-col gap-3" style={{ width: 190 }}>
                    {/* Nhạc nền */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-white/70 text-xs font-bold">
                            <Music size={15} /> Nhạc nền
                            <span className="ml-auto text-white/40">{Math.round(bgm * 100)}%</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.01} value={bgm}
                            onChange={(e) => { const v = parseFloat(e.target.value); setBgm(v); setBgmVolume(v); }}
                            className="w-full accent-[#e6a822] cursor-pointer"
                        />
                    </div>
                    {/* Hiệu ứng */}
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-white/70 text-xs font-bold">
                            {sfx === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />} Hiệu ứng
                            <span className="ml-auto text-white/40">{Math.round(sfx * 100)}%</span>
                        </div>
                        <input
                            type="range" min={0} max={1} step={0.01} value={sfx}
                            onChange={(e) => { const v = parseFloat(e.target.value); setSfx(v); setSfxVolume(v); }}
                            className="w-full accent-[#e6a822] cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Nút gập/mở */}
            <button
                onClick={() => setOpen((o) => !o)}
                title="Âm lượng"
                className="w-9 h-12 flex items-center justify-center bg-black/55 backdrop-blur-xl border border-white/10 border-l-0 rounded-r-xl text-white/70 hover:text-white hover:bg-black/70 transition-all shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
            >
                {open ? <ChevronLeft size={18} /> : <Volume2 size={18} />}
            </button>
        </div>
    );
}
