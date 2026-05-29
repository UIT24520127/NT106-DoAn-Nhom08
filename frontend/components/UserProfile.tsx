"use client";
import { useEffect, useState } from "react";
import { X, Trophy, Gamepad2, Target, Star, Camera, User as UserIcon } from "lucide-react";
import AvatarEditModal from "./AvatarEditModal";

interface UserProfileProps {
  isOpen: boolean;
  onClose: () => void;
  stats: {
    username: string;
    totalGames: number;
    wins: number; // Đây có thể là tổng trận thắng
    civilianWins: number;   // Thêm mới
    undercoverWins: number; // Thêm mới
    mrWhiteWins: number;    // Thêm mới
    winRate: string;
    mostPlayedRole: string;
    avatar?: string;       // Thêm ảnh đại diện
  };
  onAvatarUpdated?: (newAvatar: string) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose, stats, onAvatarUpdated }) => {
  const [animate, setAnimate] = useState(false);
  const [localAvatar, setLocalAvatar] = useState(stats.avatar || "");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setLocalAvatar(stats.avatar || "");
  }, [stats.avatar]);

  if (!isOpen && !animate) return null;

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") || "" : "";

  return (
    <>
      {/* Nền mờ */}
      <div 
        className={`fixed inset-0 bg-black/70 z-[60] transition-opacity duration-300 ease-out
          ${animate ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Cửa sổ trượt */}
      <div 
        className={`fixed top-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-lg mt-10 p-6
          bg-[#1a1c23] border-2 border-gray-700 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]
          transition-all duration-500 ease-out transform
          ${animate ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
          <X size={24} />
        </button>

        {/* TIÊU ĐỀ HỒ SƠ */}
        <div className="flex flex-col items-center mb-8 border-b border-gray-700 pb-6">
          
          {/* Avatar tròn tương tác */}
          <div 
            onClick={() => setIsEditModalOpen(true)}
            className="group relative w-24 h-24 mb-4 rounded-full border-2 border-gray-600 hover:border-[#e6a822] cursor-pointer shadow-lg overflow-hidden flex items-center justify-center bg-gradient-to-tr from-[#111317] to-[#1a1c23] transition-all duration-300"
          >
            {localAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={localAvatar} 
                alt="Đặc vụ Avatar" 
                className="w-full h-full object-cover rounded-full" 
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-[#e6a822] font-black text-3xl">
                {stats.username ? stats.username.charAt(0).toUpperCase() : <Star size={36} />}
              </div>
            )}
            
            {/* Lớp phủ hover đổi ảnh đại diện */}
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Camera size={20} className="text-[#e6a822]" />
              <span className="text-[9px] font-black text-white mt-1 tracking-wider uppercase">Đổi ảnh</span>
            </div>
          </div>

          <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-md">
            {stats.username}
          </h2>
          <p className="text-[#e6a822] font-bold text-sm mt-1 uppercase tracking-widest">
            Hồ sơ đặc vụ
          </p>
        </div>

        {/* THÔNG SỐ CHÍNH */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard icon={Gamepad2} label="Tổng số trận" value={stats.totalGames} color="#3b82f6" />
          <StatCard icon={Target} label="Tỉ lệ thắng" value={stats.winRate} color="#e6a822" />
        </div>

        {/* CHI TIẾT TRẬN THẮNG THEO VAI TRÒ */}
        <p className="text-gray-400 text-xs uppercase tracking-widest mb-3 font-bold">Thắng theo vai trò</p>
        <div className="space-y-3">
          <StatCard icon={Trophy} label="Dân thường" value={stats.civilianWins} color="#22c55e" />
          <StatCard icon={Trophy} label="Mũ đen" value={stats.undercoverWins} color="#ef4444" />
          <StatCard icon={Trophy} label="Mũ trắng" value={stats.mrWhiteWins} color="#ffffff" />
        </div>

        <button onClick={onClose} className="w-full mt-8 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition shadow-md">
          Đóng
        </button>
      </div>

      {/* MODAL CẮT VÀ CHỌN ẢNH ĐẠI DIỆN */}
      <AvatarEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        userId={userId}
        currentAvatar={localAvatar}
        onAvatarUpdated={(newAvatar) => {
          setLocalAvatar(newAvatar);
          if (onAvatarUpdated) {
            onAvatarUpdated(newAvatar);
          }
        }}
      />
    </>
  );
};

// Component phụ
const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: any, color: string }) => (
  <div className="bg-[#111317] p-5 rounded-2xl border border-gray-800 flex items-center gap-4 shadow-inner">
    <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
      <Icon size={24} style={{ color: color }} strokeWidth={2.5} />
    </div>
    <div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-white mt-0.5" style={{ color: color }}>{value}</p>
    </div>
  </div>
);

export default UserProfile;