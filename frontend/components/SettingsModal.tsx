"use client";
import React, { useState, useEffect } from "react";
import { X, Volume2, Mic, Music, Settings2, Monitor, LogOut, Power } from "lucide-react";
import {
  getMenuBgmVolume, getGameBgmVolume,
  getSfxUiVolume, getSfxLobbyVolume, getSfxGameplayVolume, getSfxEndgameVolume,
  getMicVolume, getVoiceOutputVolume,
  setMenuBgmVolume, setGameBgmVolume,
  setSfxUiVolume, setSfxLobbyVolume, setSfxGameplayVolume, setSfxEndgameVolume,
  setMicVolume, setVoiceOutputVolume,
  subscribeSound
} from "@/lib/soundSettings";
import { useGameSound } from "@/hooks/useGameSound";

interface SettingsModalProps {
  onClose: () => void;
  onLogout?: () => void;
}

export default function SettingsModal({ onClose, onLogout }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"BGM" | "SFX" | "VOICE" | "DISPLAY">("BGM");
  const { playClick } = useGameSound();

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    setIsFullscreen(!!document.fullscreenElement);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    playClick();
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  const [vols, setVols] = useState({
    menuBgm: 0, gameBgm: 0,
    sfxUi: 0, sfxLobby: 0, sfxGame: 0, sfxEnd: 0,
    mic: 0, voice: 0
  });

  useEffect(() => {
    const updateVols = () => {
      setVols({
        menuBgm: getMenuBgmVolume(),
        gameBgm: getGameBgmVolume(),
        sfxUi: getSfxUiVolume(),
        sfxLobby: getSfxLobbyVolume(),
        sfxGame: getSfxGameplayVolume(),
        sfxEnd: getSfxEndgameVolume(),
        mic: getMicVolume(),
        voice: getVoiceOutputVolume()
      });
    };
    updateVols();
    return subscribeSound(updateVols);
  }, []);

  const handleTabClick = (tab: "BGM" | "SFX" | "VOICE" | "DISPLAY") => {
    playClick();
    setActiveTab(tab);
  };

  const renderSlider = (label: string, val: number, setter: (v: number) => void) => (
    <div className="mb-4">
      <div className="flex justify-between text-sm text-gray-300 font-semibold mb-2">
        <span>{label}</span>
        <span>{Math.round(val * 100)}%</span>
      </div>
      <input
        type="range" min="0" max="1" step="0.01"
        value={val} onChange={(e) => setter(parseFloat(e.target.value))}
        className="w-full accent-[#e6a822] cursor-pointer"
      />
    </div>
  );

  return (
    <div onClick={() => { playClick(); onClose(); }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div 
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <Settings2 className="text-[#e6a822]" />
            Cài Đặt Hệ Thống
          </div>
          <button onClick={() => { playClick(); onClose(); }} className="text-gray-400 hover:text-white transition">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-800/50">
          <button 
            onClick={() => handleTabClick("BGM")}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition ${activeTab === "BGM" ? "text-[#e6a822] border-b-2 border-[#e6a822]" : "text-gray-400 hover:text-gray-200"}`}
          >
            <Music size={18} />
            <span>Nhạc Nền</span>
          </button>
          <button 
            onClick={() => handleTabClick("SFX")}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition ${activeTab === "SFX" ? "text-[#e6a822] border-b-2 border-[#e6a822]" : "text-gray-400 hover:text-gray-200"}`}
          >
            <Volume2 size={18} />
            <span>Hiệu Ứng</span>
          </button>
          <button 
            onClick={() => handleTabClick("VOICE")}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition ${activeTab === "VOICE" ? "text-[#e6a822] border-b-2 border-[#e6a822]" : "text-gray-400 hover:text-gray-200"}`}
          >
            <Mic size={18} />
            <span>Voice Chat</span>
          </button>
          <button 
            onClick={() => handleTabClick("DISPLAY")}
            className={`flex-1 py-3 text-sm font-bold flex flex-col items-center gap-1 transition ${activeTab === "DISPLAY" ? "text-[#e6a822] border-b-2 border-[#e6a822]" : "text-gray-400 hover:text-gray-200"}`}
          >
            <Monitor size={18} />
            <span>Tổng Quan</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "BGM" && (
            <div className="animate-fadeIn">
              {renderSlider("Nhạc nền Menu", vols.menuBgm, setMenuBgmVolume)}
              {renderSlider("Nhạc nền Game", vols.gameBgm, setGameBgmVolume)}
            </div>
          )}
          
          {activeTab === "SFX" && (
            <div className="animate-fadeIn">
              {renderSlider("Hệ thống & Giao diện", vols.sfxUi, setSfxUiVolume)}
              {renderSlider("Sảnh & Chờ", vols.sfxLobby, setSfxLobbyVolume)}
              {renderSlider("Trong Trận đấu", vols.sfxGame, setSfxGameplayVolume)}
              {renderSlider("Kết thúc Game", vols.sfxEnd, setSfxEndgameVolume)}
            </div>
          )}

          {activeTab === "VOICE" && (
            <div className="animate-fadeIn">
              {renderSlider("Âm lượng Mic (Microphone)", vols.mic, setMicVolume)}
              {renderSlider("Âm lượng Giọng nói (Voice Output)", vols.voice, setVoiceOutputVolume)}
              <p className="text-xs text-gray-500 mt-4 italic">
                * Lưu ý: Tùy chỉnh Âm lượng Mic có thể phụ thuộc vào quyền điều khiển thiết bị của trình duyệt.
              </p>
            </div>
          )}

          {activeTab === "DISPLAY" && (
            <div className="animate-fadeIn space-y-3">
              {/* Chế độ toàn màn hình */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-white font-bold text-sm">Chế độ toàn màn hình</span>
                <button
                  onClick={toggleFullscreen}
                  className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${isFullscreen ? "bg-[#e6a822] text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
                >
                  {isFullscreen ? "TẮT" : "BẬT"}
                </button>
              </div>

              {/* Đăng xuất */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-white font-bold text-sm flex items-center gap-2">
                  <LogOut size={15} /> Đăng xuất
                </span>
                <button
                  onClick={() => { if (onLogout) onLogout(); }}
                  className="px-6 py-2 rounded-lg font-bold text-sm bg-white/10 text-white hover:bg-white/20 transition-all"
                >
                  ĐĂNG XUẤT
                </button>
              </div>

              {/* Thoát game */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <span className="text-white font-bold text-sm flex items-center gap-2">
                  <Power size={15} /> Thoát game
                </span>
                <button
                  onClick={async () => {
                    playClick();
                    try {
                      const { exit } = await import('@tauri-apps/plugin-process');
                      await exit(0);
                    } catch {
                      window.close();
                    }
                  }}
                  className="px-6 py-2 rounded-lg font-bold text-sm bg-white/10 text-white hover:bg-white/20 transition-all"
                >
                  THOÁT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
