"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { realtimeDb } from "@/lib/firebase";
import { ref, set } from "firebase/database";

export default function FriendSearch({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isSuccess: true });

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`http://localhost:5120/api/friends/search?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data);
      } catch (err) {
        console.error("Lỗi tìm kiếm", err);
      }
      setLoading(false);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, token]);

  const sendRequest = async (targetUserId: string) => {
    try {
      await axios.post("http://localhost:5120/api/friends/request", { targetUserId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const myUid = localStorage.getItem("userId");
      if (myUid) {
        await set(ref(realtimeDb, `friendRequests/${targetUserId}/${myUid}`), Date.now());
      }
      
      setPopup({ isOpen: true, message: "Đã gửi lời mời kết bạn thành công!", isSuccess: true });
    } catch (err: any) {
      setPopup({ isOpen: true, message: err.response?.data?.message || "Lỗi gửi lời mời", isSuccess: false });
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
      <h2 className="text-xl font-bold text-white mb-4">Tìm kiếm bạn bè</h2>
      <input
        type="text"
        placeholder="Nhập tên người chơi..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-lg bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      {loading && <p className="text-sm text-gray-400 mt-2 italic">Đang tìm kiếm...</p>}
      
      {results.length > 0 && (
        <ul className="mt-4 space-y-3">
          {results.map((user) => (
            <li key={user.id} className="flex justify-between items-center bg-gray-700 px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors">
              <span className="font-medium text-white">{user.username}</span>
              <button
                onClick={() => sendRequest(user.id)}
                className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded-md text-sm font-semibold transition"
              >
                + Kết bạn
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* POPUP HIỂN THỊ */}
      {popup.isOpen && (
        <div 
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center"
          onClick={() => setPopup({ ...popup, isOpen: false })}
        >
          <div 
            className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-7 w-80 text-center shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${popup.isSuccess ? 'bg-green-900/50' : 'bg-red-950'}`}>
              {popup.isSuccess ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              )}
            </div>
            <h2 className="text-base font-bold text-white mb-2">Thông báo</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              {popup.message}
            </p>
            <button
              onClick={() => setPopup({ ...popup, isOpen: false })}
              className="w-full py-2.5 rounded-xl bg-[#111317] text-gray-400 border border-gray-700 text-sm font-semibold hover:bg-gray-800 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
