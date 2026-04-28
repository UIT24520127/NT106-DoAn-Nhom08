"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, realtimeDb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import FriendList from "@/components/friends/FriendList";
import FriendSearch from "@/components/friends/FriendSearch";
import FriendRequests from "@/components/friends/FriendRequests";

type Tab = "list" | "search" | "requests";

interface TabItem {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { id: "list", label: "Danh sách", icon: "👥" },
  { id: "search", label: "Tìm kiếm", icon: "🔍" },
  { id: "requests", label: "Lời mời", icon: "📨" },
];

export default function FriendsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("list");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;
    const requestsRef = ref(realtimeDb, `friendRequests/${uid}`);
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setPendingCount(Object.keys(data).length);
      } else {
        setPendingCount(0);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setToken(storedToken);
    } else {
      router.push("/login");
    }
  }, [router]);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-white font-semibold">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-6 font-sans selection:bg-amber-500 selection:text-white">
      <div className="max-w-3xl mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-2xl font-extrabold text-amber-500 tracking-[3px] uppercase">
            Bạn Bè
          </h1>
          <button
            onClick={() => router.push("/menu")}
            className="text-xs text-gray-400 bg-[#1a1c23] border border-gray-700 px-4 py-2 rounded-lg hover:text-white transition"
          >
            ← Trở về Menu
          </button>
        </div>

        {/* TABS */}
        <div className="flex justify-center gap-3 mb-6">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? "bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-900/50 -translate-y-0.5"
                    : "bg-[#1a1c23] text-gray-400 border border-gray-700 hover:bg-[#21242e] hover:text-gray-200 hover:border-gray-600"
                  }
                `}
              >
                <span className="text-base">{tab.icon}</span>
                {tab.label}
                {tab.id === "requests" && pendingCount > 0 && (
                  <span
                    className={`
                      inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black
                      ${isActive ? "bg-white/25 text-white" : "bg-amber-500 text-black"}
                    `}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* PANEL */}
        <div className="bg-[#1a1c23] border border-gray-700 rounded-2xl p-6 shadow-2xl">
          {activeTab === "list" && <FriendList token={token} />}
          {activeTab === "search" && <FriendSearch token={token} />}
          {activeTab === "requests" && (
            <FriendRequests token={token} pendingCount={pendingCount} />
          )}
        </div>

      </div>
    </div>
  );
}