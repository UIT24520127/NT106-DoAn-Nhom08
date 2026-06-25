"use client";

import { useState } from "react";
import { MessageSquare, MoreVertical, Trash2, ShieldAlert } from "lucide-react";

// Tiện ích âm thanh retro
const playSound = (type: "click" | "invite") => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (type === "click") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === "invite") {
      const playChime = (freq: number, delay: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.25);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.25);
      };
      playChime(900, 0);
      playChime(1300, 0.08);
    }
  } catch (err) {
    // Web Audio API blocked or not supported
  }
};

export default function FriendCard({ 
  friend, 
  presence, 
  onUnfriend, 
  onBlock, 
  onInvite, 
  onAvatarClick,
  onChat,
  hasUnread,
  showInvite = false
}: any) {
  const isOnline = presence === "Online";
  const isInMatch = presence === "In-Match";
  const isInRoom = presence === "In-Room";
  
  const [showMenu, setShowMenu] = useState(false);
  const [isInvited, setIsInvited] = useState(false);

  // Tính level giả định dựa trên id hoặc tên bạn bè để hiển thị cực ngầu
  const mockLevel = friend.id 
    ? (friend.id.charCodeAt(0) % 40) + 15 
    : (friend.username ? (friend.username.charCodeAt(0) % 40) + 15 : 20);

  const handleInviteClick = () => {
    if (!isOnline || isInvited) return;
    playSound("invite");
    setIsInvited(true);
    if (onInvite) {
      onInvite(friend.id, friend.username);
    }
    // Trở lại trạng thái có thể mời sau 15 giây
    setTimeout(() => setIsInvited(false), 30000);
  };

  const handleChatClick = () => {
    playSound("click");
    if (onChat) onChat(friend);
  };

  return (
    <div className="relative flex items-center justify-between bg-gradient-to-r from-[#171923] to-[#1e2130] p-3 rounded-2xl border border-gray-800 hover:border-gray-700/80 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300">
      
      {/* CỘT TRÁI: AVATAR & THÔNG TIN */}
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        
        {/* Avatar với Khung phát sáng theo trạng thái */}
        <div 
          className="relative cursor-pointer group flex-shrink-0"
          onClick={(e) => { 
            e.stopPropagation(); 
            playSound("click");
            if (onAvatarClick) onAvatarClick(friend.id); 
          }}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black transition-all duration-300 bg-gradient-to-tr from-gray-900 to-gray-800 text-white border-2 ${
            isOnline 
              ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] group-hover:scale-105' 
              : isInMatch 
              ? 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)] group-hover:scale-105 animate-pulse' 
              : 'border-gray-600 shadow-none group-hover:scale-105'
          }`}>
            {friend.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover rounded-full" />
            ) : (
              friend.username ? friend.username.charAt(0).toUpperCase() : "?"
            )}
          </div>
          
          {/* Chấm tròn trạng thái nhỏ góc dưới */}
          <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#171923] ${
            isOnline ? 'bg-emerald-500' : isInMatch ? 'bg-amber-500' : 'bg-gray-500'
          }`}></span>
          
          {/* Huy hiệu Level giả định ở góc trên trái avatar */}
          <span className="absolute -top-1.5 -left-1.5 bg-[#e6a822] text-[#000] text-[8px] font-black px-1 rounded border border-black scale-90">
            {mockLevel}
          </span>
        </div>

        {/* Username & Trạng thái chữ */}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-sm text-gray-100 truncate flex items-center gap-1.5">
            {friend.username}
          </p>
          <p className={`text-[10px] font-bold tracking-wider uppercase mt-0.5 ${
            isOnline ? 'text-emerald-400' : isInMatch ? 'text-amber-400' : isInRoom ? 'text-blue-400' : 'text-gray-400'
          }`}>
            {isOnline ? 'Đang online' : isInMatch ? 'Trong trận' : isInRoom ? 'Trong phòng' : 'Ngoại tuyến'}
          </p>
        </div>
      </div>

      {/* CỘT PHẢI: CÁC NÚT HÀNH ĐỘNG */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        
        {/* Nút Chat kèm Badge Số tin nhắn chưa đọc */}
        <button
          onClick={handleChatClick}
          className={`relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition active:scale-90 border border-transparent hover:border-gray-700 ${hasUnread ? 'bg-red-950/20 text-red-400 border-red-500/20' : ''}`}
          title="Nhắn tin"
        >
          <MessageSquare size={18} />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
          )}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
          )}
        </button>

        {/* Nút Mời phòng (Nổi bật nhất) */}
        {showInvite && isOnline && (
          <button 
            onClick={handleInviteClick}
            disabled={isInvited}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-md transition-all duration-300 active:scale-95 border-b-[3px] ${
              isInvited
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-800 cursor-default shadow-none translate-y-0.5 border-b'
                : 'bg-[#e6a822] text-black border-yellow-700 hover:bg-yellow-400 hover:shadow-yellow-500/20'
            }`}
          >
            {isInvited ? 'Đã mời' : 'Mời'}
          </button>
        )}

        {isInMatch && (
          <button 
            disabled
            className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed"
          >
            Trong trận
          </button>
        )}

        {/* Nút Menu ba chấm thu gọn các chức năng phụ */}
        <div className="relative">
          <button 
            onClick={() => { playSound("click"); setShowMenu(!showMenu); }}
            className={`p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition active:scale-90 ${showMenu ? 'bg-gray-800 text-white' : ''}`}
          >
            <MoreVertical size={16} />
          </button>

          {showMenu && (
            <>
              {/* Overlay trong suốt đóng menu khi click ngoài */}
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowMenu(false)}
              />
              
              <div className="absolute right-0 mt-1 w-36 bg-[#111317] border border-gray-800 rounded-xl shadow-2xl py-1 z-20 animate-in fade-in slide-in-from-top-1 duration-150">
                <button 
                  onClick={() => {
                    playSound("click");
                    setShowMenu(false);
                    onUnfriend(friend.id);
                  }} 
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-950/20 hover:text-red-300 transition"
                >
                  <Trash2 size={13} />
                  Hủy kết bạn
                </button>
                <button 
                  onClick={() => {
                    playSound("click");
                    setShowMenu(false);
                    onBlock(friend.id);
                  }} 
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition border-t border-gray-800/80"
                >
                  <ShieldAlert size={13} />
                  Chặn đặc vụ
                </button>
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
}
