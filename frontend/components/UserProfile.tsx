"use client";
import { useEffect, useState } from "react";
import { X, Trophy, Gamepad2, Target, Star } from "lucide-react";

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
  };
}

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose, stats }) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  if (!isOpen && !animate) return null;

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
          <div className="bg-[#e6a822] p-4 rounded-full shadow-lg mb-4">
            <Star size={40} color="black" strokeWidth={2.5} />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-md">
            {stats.username}
          </h2> {/* <-- Sửa chỗ này: Đóng h2 thay vì div */}
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
          {/* Bạn có thể tạo Component mới hoặc dùng lại StatCard nhưng chỉnh layout */}
          <StatCard icon={Trophy} label="Dân thường" value={stats.civilianWins} color="#22c55e" />
          <StatCard icon={Trophy} label="Mũ đen" value={stats.undercoverWins} color="#ef4444" />
          <StatCard icon={Trophy} label="Mũ trắng" value={stats.mrWhiteWins} color="#ffffff" />
        </div>

        <button onClick={onClose} className="w-full mt-8 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition shadow-md">
          Đóng
        </button>
      </div>
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