"use client";

import { useEffect, useState } from "react";
import { X, Users, Search, Mail, ArrowRight, UserCheck } from "lucide-react";
import FriendList from "@/components/friends/FriendList";
import FriendSearch from "@/components/friends/FriendSearch";
import FriendRequests from "@/components/friends/FriendRequests";
import FriendChat from "@/components/friends/FriendChat";
import UserProfile from "@/components/UserProfile";
import { API_URL } from "@/lib/auth";

type Tab = "list" | "search" | "requests";

interface FriendModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: string;
    pendingCount: number;
    showInvite?: boolean;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "list", label: "Danh sách", icon: <Users size={13} /> },
    { id: "search", label: "Tìm kiếm", icon: <Search size={13} /> },
    { id: "requests", label: "Lời mời", icon: <Mail size={13} /> },
];

// Bộ tổng hợp âm thanh retro
const playSound = (type: "click" | "open") => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === "click") {
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === "open") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }
  } catch (err) {
    // blocked
  }
};

export default function FriendModal({ isOpen, onClose, token, pendingCount, showInvite = false }: FriendModalProps) {
    const [animate, setAnimate] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("list");
    const [activeChatFriend, setActiveChatFriend] = useState<any | null>(null);

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [profileStats, setProfileStats] = useState<any>(null);
    const [isProfileLoading, setIsProfileLoading] = useState(false);

    const handleUserClick = async (userId: string) => {
        playSound("click");
        setIsProfileLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/user/profile/${userId}`);
            if (response.ok) {
                const data = await response.json();
                setProfileStats({
                    username: data.username || data.Username || "Đặc vụ ẩn danh",
                    totalGames: data.totalGames || data.TotalGames || 0,
                    wins: data.wins || data.Wins || data.totalWins || data.TotalWins || 0,
                    civilianWins: data.civilianWins || data.CivilianWins || 0,
                    undercoverWins: data.undercoverWins || data.UndercoverWins || 0,
                    mrWhiteWins: data.mrWhiteWins || data.MrWhiteWins || 0,
                    winRate: data.winRate || data.WinRate || "0%",
                    mostPlayedRole: data.mostPlayedRole || data.MostPlayedRole || "Tân binh",
                    avatar: data.avatar || data.Avatar || ""
                });
                setIsProfileOpen(true);
            } else {
                alert("Không thể tải hồ sơ người dùng.");
            }
        } catch (error) {
            alert("Lỗi tải thông tin người dùng!");
        } finally {
            setIsProfileLoading(false);
        }
    };

    const handleTabChange = (tabId: Tab) => {
        playSound("click");
        setActiveTab(tabId);
    };

    useEffect(() => {
        if (isOpen) {
            playSound("open");
            const t = setTimeout(() => setAnimate(true), 10);
            return () => clearTimeout(t);
        } else {
            setAnimate(false);
        }
    }, [isOpen]);

    // Khóa scroll của trang nền khi sidebar mở
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // Đóng khi bấm Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { 
            if (e.key === "Escape") {
                playSound("click");
                onClose(); 
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    if (!isOpen && !animate) return null;

    return (
        <>
            {/* Click Outside Overlay - Hoàn toàn trong suốt để nhìn thấy Lobby sắc nét */}
            <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => { playSound("click"); onClose(); }}
            />

            {/* Sidebar Trượt Từ Phải */}
            <div
                className={`fixed top-0 right-0 z-50 h-screen w-full sm:w-[385px] p-5 flex flex-col
              bg-[#0e1017]/95 border-l border-gray-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-lg
              transition-transform duration-300 ease-out transform
              ${animate ? "translate-x-0" : "translate-x-full"}`}
            >
                {/* Header Sidebar */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-4 mt-2 flex-shrink-0">
                    <div className="flex items-center space-x-2.5">
                        <div className="bg-[#e6a822] p-1.5 rounded-xl shadow-lg shadow-amber-900/10">
                            <UserCheck size={18} color="black" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-wide uppercase">
                                {activeChatFriend ? "Mật thư liên lạc" : "Đặc vụ liên lạc"}
                            </h2>
                            <p className="text-[9px] text-[#e6a822] font-black uppercase tracking-widest leading-none mt-0.5">
                                {activeChatFriend ? "Kênh chat riêng tư" : "Danh sách đồng đội"}
                            </p>
                        </div>
                    </div>

                    {/* Nút đóng slide-out */}
                    <button
                        onClick={() => { playSound("click"); onClose(); }}
                        className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/80 transition active:scale-95 flex-shrink-0 border border-transparent hover:border-gray-700"
                    >
                        <ArrowRight size={18} />
                    </button>
                </div>

                {/* Phần thân nội dung */}
                <div className="flex-1 flex flex-col min-h-0">
                    
                    {activeChatFriend ? (
                        /* VIEW CHAT */
                        <FriendChat 
                            friend={activeChatFriend}
                            token={token}
                            onBack={() => { playSound("click"); setActiveChatFriend(null); }}
                        />
                    ) : (
                        /* VIEW DANH SÁCH & TABS CHÍNH */
                        <>
                            {/* Tabs Navigation */}
                            <div className="flex gap-1.5 mb-4 flex-shrink-0 bg-[#161821] p-1 rounded-xl border border-gray-800/50">
                                {TABS.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabChange(tab.id)}
                                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200
                                              ${isActive
                                                    ? "bg-[#e6a822] text-black shadow-lg shadow-amber-500/10 -translate-y-[1px]"
                                                    : "text-gray-400 hover:bg-gray-800/40 hover:text-gray-200"
                                                }`}
                                        >
                                            {tab.icon}
                                            <span className="hidden sm:inline">{tab.label}</span>
                                            {tab.id === "requests" && pendingCount > 0 && (
                                                <span className={`inline-flex items-center justify-center w-4.5 h-4.5 rounded-full text-[9px] font-black ml-1
                                                ${isActive ? "bg-black text-white" : "bg-red-500 text-white animate-pulse"}`}>
                                                    {pendingCount}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* View Content (Scrollable list) */}
                            <div
                                className="flex-grow overflow-y-auto pr-1 custom-scroll"
                                onWheel={(e) => e.stopPropagation()}
                            >
                                {activeTab === "list" && (
                                    <FriendList 
                                        token={token} 
                                        onAvatarClick={handleUserClick} 
                                        onChat={(friend) => setActiveChatFriend(friend)}
                                        showInvite={showInvite}
                                    />
                                )}
                                {activeTab === "search" && (
                                    <FriendSearch 
                                        token={token} 
                                        onAvatarClick={handleUserClick} 
                                    />
                                )}
                                {activeTab === "requests" && (
                                    <FriendRequests 
                                        token={token} 
                                        pendingCount={pendingCount} 
                                        onAvatarClick={handleUserClick} 
                                    />
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Sidebar */}
                <div className="pt-4 border-t border-gray-800 mt-auto flex-shrink-0 flex gap-2">
                    <button
                        onClick={() => { playSound("click"); onClose(); }}
                        className="w-full bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 font-extrabold text-xs py-2.5 rounded-xl border border-gray-700 transition active:scale-95 text-center uppercase tracking-wider"
                    >
                        Quay lại Sảnh
                    </button>
                </div>
            </div>
            
            {/* User Profile Modal */}
            <UserProfile 
                isOpen={isProfileOpen} 
                onClose={() => setIsProfileOpen(false)} 
                stats={profileStats || {
                    username: "Đang tải...",
                    totalGames: 0,
                    wins: 0,
                    civilianWins: 0,
                    undercoverWins: 0,
                    mrWhiteWins: 0,
                    winRate: "0%",
                    mostPlayedRole: "Tân binh"
                }} 
                isOwnProfile={false}
            />
        </>
    );
}