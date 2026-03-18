"use client";
import { useState } from "react";
import { Users, Settings, CircleHelp } from "lucide-react";

export default function MainMenu() {
  // Biến này để kiểm tra xem người dùng đã bấm PLAY hay chưa
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="relative h-screen w-screen bg-[url('/bg.jpg')] bg-cover bg-center overflow-hidden">
      
      {/* 3 NÚT Ở GÓC TRÊN BÊN PHẢI (Thiết kế giống ảnh 3) */}
      <div className="absolute top-6 right-8 flex gap-3 z-20">
        <button className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg">
          <Users size={32} color="white" strokeWidth={2.5} />
        </button>
        <button className="bg-[#1a1c23] p-3 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg">
          <Settings size={32} color="white" strokeWidth={2.5} />
        </button>
        <button className="bg-[#1a1c23] p-3 px-4 rounded-2xl border-2 border-transparent hover:border-gray-500 transition shadow-lg flex items-center justify-center">
          <span className="text-white text-3xl font-bold italic">?</span>
        </button>
      </div>

      {/* KHU VỰC TRUNG TÂM */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pt-20">
        {!showOptions ? (
          // Nếu chưa bấm PLAY, hiện nút PLAY to
          <button 
            onClick={() => setShowOptions(true)}
            className="text-6xl font-black text-white bg-transparent hover:scale-110 transition-transform duration-300 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]"
            style={{ WebkitTextStroke: '2px black' }}
          >
            PLAY
          </button>
        ) : (
          // Nếu ĐÃ bấm PLAY, hiện 2 lựa chọn
          <div className="flex flex-col gap-6 items-center">
            <button className="bg-[#e6a822] text-black px-12 py-4 rounded-full text-3xl font-bold border-4 border-black hover:scale-105 transition-transform shadow-[0_8px_0_black] active:translate-y-2 active:shadow-none">
              CHƠI NGAY
            </button>
            <button className="bg-[#3b82f6] text-white px-12 py-4 rounded-full text-3xl font-bold border-4 border-black hover:scale-105 transition-transform shadow-[0_8px_0_black] active:translate-y-2 active:shadow-none">
              CHƠI VỚI BẠN
            </button>
            
            {/* Nút quay lại để test */}
            <button 
              onClick={() => setShowOptions(false)}
              className="mt-6 text-white font-bold underline hover:text-gray-300 drop-shadow-md"
            >
              Quay lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
}