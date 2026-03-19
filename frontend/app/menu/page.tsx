"use client";
import { useState, useEffect } from "react";
import { Users, Settings } from "lucide-react";

export default function MainMenu() {
  const [showOptions, setShowOptions] = useState(false);
  const [showTitle, setShowTitle] = useState(false);

  // Kích hoạt hiệu ứng xuất hiện tiêu đề sau khi trang load 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTitle(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative h-screen w-screen bg-[url('/bg.png')] bg-cover bg-center overflow-hidden">
      
      {/* TIÊU ĐỀ GAME (AI LÀ GIÁN ĐIỆP) */}
      <div 
        className={`absolute top-[8%] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center text-center transition-all duration-1000 ease-out
          ${showTitle ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-8 scale-95'}
        `}
      >
        <h1 
          className="text-5xl md:text-7xl font-black text-[#e6a822] tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]"
          style={{ WebkitTextStroke: '2px black' }}
        >
          UNDERCOVER
        </h1>
        <h2 
          className="text-2xl md:text-3xl font-bold text-white mt-1 drop-shadow-[0_3px_3px_rgba(0,0,0,1)] italic"
          style={{ WebkitTextStroke: '1px black' }}
        >
          Ai là gián điệp ?
        </h2>
      </div>

      {/* 3 NÚT Ở GÓC TRÊN BÊN PHẢI */}
      <div className="absolute top-6 right-8 flex gap-3 z-20">
        <button className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg">
          <Users size={24} color="white" strokeWidth={2.5} />
        </button>
        <button className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg">
          <Settings size={24} color="white" strokeWidth={2.5} />
        </button>
        <button className="bg-[#1a1c23] p-3 px-4 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg flex items-center justify-center">
          <span className="text-white text-xl font-bold italic">?</span>
        </button>
      </div>

      {/* KHU VỰC TRUNG TÂM */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        
        <div className="mt-[400px] flex flex-col items-center">
          {!showOptions ? (
            <button 
              onClick={() => setShowOptions(true)}
              className="text-4xl md:text-5xl font-black text-white bg-transparent hover:scale-110 transition-transform duration-300 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]"
              style={{ WebkitTextStroke: '1.5px black' }}
            >
              PLAY
            </button>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              {/* Lưu ý nhỏ: Tailwind không có sẵn w-35, mình đổi thành w-40 (hoặc bạn dùng w-[140px]) để nút không bị mất khung nhé */}
              <button className="bg-[#e6a822] text-black w-40 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CHƠI NGAY
              </button>
              
              <button className="bg-[#3b82f6] text-white w-40 py-2.5 rounded-full text-base font-bold border-[3px] border-black hover:scale-105 transition-transform shadow-[0_5px_0_black] active:translate-y-1 active:shadow-none">
                CHƠI VỚI BẠN
              </button>
              
              <button 
                onClick={() => setShowOptions(false)}
                className="mt-2 text-white/80 text-sm font-bold underline hover:text-white drop-shadow-md"
              >
                Quay lại
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}