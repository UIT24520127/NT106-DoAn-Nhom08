"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Users, Search, Mail, UserMinus } from "lucide-react";
import FriendList from "@/components/friends/FriendList";
import FriendSearch from "@/components/friends/FriendSearch";
import FriendRequests from "@/components/friends/FriendRequests";
import UserProfile from "@/components/UserProfile";

type Tab = "list" | "search" | "requests";

interface FriendModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: string;
    pendingCount: number;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "list", label: "Danh sách", icon: <Users size={14} /> },
    { id: "search", label: "Tìm kiếm", icon: <Search size={14} /> },
    { id: "requests", label: "Lời mời", icon: <Mail size={14} /> },
];

export default function FriendModal({ isOpen, onClose, token, pendingCount }: FriendModalProps) {
    const [animate, setAnimate] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("list");

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [profileStats, setProfileStats] = useState<any>(null);
    const [isProfileLoading, setIsProfileLoading] = useState(false);

    const handleUserClick = async (userId: string) => {
        setIsProfileLoading(true);
        try {
            const response = await fetch(`http://localhost:5120/api/user/profile/${userId}`);
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
                    mostPlayedRole: data.mostPlayedRole || data.MostPlayedRole || "Tân binh"
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

    useEffect(() => {
        if (isOpen) {
            const t = setTimeout(() => setAnimate(true), 10);
            return () => clearTimeout(t);
        } else {
            setAnimate(false);
        }
    }, [isOpen]);

    // Đóng khi bấm Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    if (!isOpen && !animate) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black/70 z-50 transition-opacity duration-300 ease-out
          ${animate ? "opacity-100" : "opacity-0"}`}
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg mt-10 p-6
          bg-[#1a1c23] border-2 border-gray-700 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]
          transition-all duration-500 ease-out transform
          ${animate ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}`}
            >
                {/* Nút đóng */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
                >
                    <X size={24} />
                </button>

                {/* Header */}
                <div className="flex flex-col items-center mb-6 border-b border-gray-700 pb-6">
                    <div className="bg-[#e6a822] p-4 rounded-full shadow-lg mb-4">
                        <Users size={36} color="black" strokeWidth={2.5} />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
                        Bạn Bè
                    </h2>
                    <p className="text-[#e6a822] font-bold text-xs mt-1 uppercase tracking-widest">
                        Hệ thống kết bạn
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-5">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200
                  ${isActive
                                        ? "bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-900/40 -translate-y-0.5"
                                        : "bg-[#111317] text-gray-400 border border-gray-700 hover:bg-[#1f2130] hover:text-gray-200"
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                                {tab.id === "requests" && pendingCount > 0 && (
                                    <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black
                    ${isActive ? "bg-white/25 text-white" : "bg-amber-500 text-black"}`}>
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="max-h-[420px] overflow-y-auto pr-1 custom-scroll">
                    {activeTab === "list" && <FriendList token={token} onAvatarClick={handleUserClick} />}
                    {activeTab === "search" && <FriendSearch token={token} onAvatarClick={handleUserClick} />}
                    {activeTab === "requests" && <FriendRequests token={token} pendingCount={pendingCount} onAvatarClick={handleUserClick} />}
                </div>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="w-full mt-5 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition shadow-md"
                >
                    Đóng
                </button>
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
            />
        </>
    );
}