"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { API_URL } from "@/lib/auth";
import { realtimeDb } from "@/lib/firebase";
import { ref, remove } from "firebase/database";
import AcceptFriendSuccessDialog from "./Acceptfriendsuccessdialog";
import { User, Loader2, Check } from "lucide-react";

export default function FriendRequests({ 
  token, 
  pendingCount,
  onAvatarClick
}: { 
  token: string;
  pendingCount?: number;
  onAvatarClick?: (id: string) => void;
}) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptedFriend, setAcceptedFriend] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, 'accepting' | 'declining' | 'accepted' | 'declined'>>({});

  const fetchRequests = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/friends/requests/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res.data);
    } catch (err) {
      console.error("Lỗi lấy danh sách lời mời", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchRequests();
  }, [token, pendingCount]);

  const respondRequest = async (friendshipId: string, accept: boolean, requesterId: string, username: string) => {
    setActionStates(prev => ({ ...prev, [friendshipId]: accept ? 'accepting' : 'declining' }));
    try {
      const endpoint = accept ? "accept" : "decline";
      await axios.post(`${API_URL}/api/friends/${endpoint}`, { friendshipId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActionStates(prev => ({ ...prev, [friendshipId]: accept ? 'accepted' : 'declined' }));

      const myUid = localStorage.getItem("userId");
      if (myUid) {
        await remove(ref(realtimeDb, `friendRequests/${myUid}/${requesterId}`));
      }

      setTimeout(() => {
        setRequests(prev => prev.filter(r => r.friendshipId !== friendshipId));
        if (accept) {
          setAcceptedFriend(username);
        }
      }, 800);
    } catch (err) {
      setActionStates(prev => {
        const newStates = { ...prev };
        delete newStates[friendshipId];
        return newStates;
      });
      alert("Lỗi phản hồi lời mời");
    }
  };

  if (loading) return <p className="text-gray-400 italic">Đang tải...</p>;

  return (
    <>
      {requests.length === 0 ? (
        <p className="text-gray-400 italic">Không có lời mời nào.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map(req => (
            <li key={req.friendshipId} className="flex justify-between items-center bg-[#161821] p-2.5 rounded-xl border border-gray-800/60 shadow-sm hover:border-gray-700 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-800 flex-shrink-0 border border-gray-700 flex items-center justify-center shadow-inner">
                  {req.avatar || req.Avatar ? (
                    <img src={req.avatar || req.Avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User size={16} className="text-gray-400" />
                  )}
                </div>
                <span 
                  className="font-bold text-sm text-gray-200 cursor-pointer hover:text-amber-400 hover:underline transition-colors"
                  onClick={() => onAvatarClick && onAvatarClick(req.id)}
                >
                  {req.username}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {actionStates[req.friendshipId] === 'accepted' ? (
                  <span className="text-emerald-500 flex items-center gap-1 text-[11px] font-bold px-2"><Check size={14} strokeWidth={3} /> Đã chấp nhận</span>
                ) : actionStates[req.friendshipId] === 'declined' ? (
                  <span className="text-red-500 flex items-center gap-1 text-[11px] font-bold px-2"><Check size={14} strokeWidth={3} /> Đã từ chối</span>
                ) : (
                  <>
                    <button 
                      onClick={() => respondRequest(req.friendshipId, false, req.id, req.username)} 
                      disabled={!!actionStates[req.friendshipId]}
                      className="bg-transparent border border-gray-600 text-gray-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {actionStates[req.friendshipId] === 'declining' && <Loader2 size={12} className="animate-spin" />}
                      Từ chối
                    </button>
                    <button 
                      onClick={() => respondRequest(req.friendshipId, true, req.id, req.username)} 
                      disabled={!!actionStates[req.friendshipId]}
                      className="bg-[#10b981] hover:bg-[#059669] text-white px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider shadow-md shadow-emerald-900/20 transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {actionStates[req.friendshipId] === 'accepting' && <Loader2 size={12} className="animate-spin" />}
                      Chấp nhận
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {acceptedFriend && (
        <AcceptFriendSuccessDialog 
          username={acceptedFriend} 
          onClose={() => setAcceptedFriend(null)} 
        />
      )}
    </>
  );
}
