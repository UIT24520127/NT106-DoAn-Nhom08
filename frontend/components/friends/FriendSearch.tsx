"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { API_URL } from "@/lib/auth";
import { realtimeDb } from "@/lib/firebase";
import { ref, onValue, set } from "firebase/database";
import { User, Loader2, Check } from "lucide-react";

export default function FriendSearch({ token, onAvatarClick }: { token: string; onAvatarClick?: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isSuccess: true });
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [requestStates, setRequestStates] = useState<Record<string, 'idle' | 'loading' | 'success'>>({});

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/friends/search?q=${query}`, {
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

  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;
    const friendsRef = ref(realtimeDb, `friends/${uid}`);
    const unsubscribe = onValue(friendsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setFriendIds(new Set(Object.values(data).map((f: any) => f.id)));
      } else {
        setFriendIds(new Set());
      }
    });
    return () => unsubscribe();
  }, []);

  const sendRequest = async (targetUserId: string) => {
    setRequestStates(prev => ({ ...prev, [targetUserId]: 'loading' }));
    try {
      await axios.post(`${API_URL}/api/friends/request`, { targetUserId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const myUid = localStorage.getItem("userId");
      if (myUid) {
        await set(ref(realtimeDb, `friendRequests/${targetUserId}/${myUid}`), Date.now());
      }
      setRequestStates(prev => ({ ...prev, [targetUserId]: 'success' }));
      setPopup({ isOpen: true, message: "Đã gửi lời mời kết bạn thành công!", isSuccess: true });
    } catch (err: any) {
      setRequestStates(prev => ({ ...prev, [targetUserId]: 'idle' }));
      setPopup({ isOpen: true, message: err.response?.data?.message || "Lỗi gửi lời mời", isSuccess: false });
    }
  };

  return (
    <div className="bg-[#111317] p-3 rounded-xl shadow-lg border border-gray-800">
      <h2 className="text-sm font-bold text-gray-200 mb-3 uppercase tracking-wider">Tìm kiếm bạn bè</h2>
      <input
        type="text"
        placeholder="Nhập tên người chơi..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-gray-900/50 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 border border-gray-800"
      />
      {loading && <p className="text-xs text-gray-500 mt-2 italic">Đang tìm kiếm...</p>}
      
      {results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {results.map((user) => (
            <li key={user.id} className="flex justify-between items-center bg-[#161821] px-3 py-2 rounded-lg border border-gray-800/60 hover:border-gray-700 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-800 flex-shrink-0 border border-gray-700 flex items-center justify-center">
                  {user.avatar || user.Avatar ? (
                    <img src={user.avatar || user.Avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-gray-400" />
                  )}
                </div>
                <span 
                  className="font-bold text-sm text-gray-200 cursor-pointer hover:text-amber-400 hover:underline transition-colors"
                  onClick={() => onAvatarClick && onAvatarClick(user.id)}
                >
                  {user.username}
                </span>
              </div>
              {friendIds.has(user.id) ? (
                <span className="text-gray-500 text-[11px] font-semibold italic">Đã là bạn bè</span>
              ) : (
                <button
                  onClick={() => sendRequest(user.id)}
                  disabled={requestStates[user.id] === 'loading' || requestStates[user.id] === 'success'}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                    requestStates[user.id] === 'success' 
                      ? 'bg-emerald-600/20 text-emerald-500 border border-emerald-800 cursor-default'
                      : 'bg-amber-600 text-black hover:bg-amber-500 shadow-md shadow-amber-900/20'
                  }`}
                >
                  {requestStates[user.id] === 'loading' && <Loader2 size={12} className="animate-spin" />}
                  {requestStates[user.id] === 'success' && <Check size={12} strokeWidth={3} />}
                  {requestStates[user.id] === 'success' ? 'Đã gửi' : requestStates[user.id] === 'loading' ? 'Đang gửi' : '+ Kết bạn'}
                </button>
              )}
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
