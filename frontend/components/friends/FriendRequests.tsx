"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { realtimeDb } from "@/lib/firebase";
import { ref, remove } from "firebase/database";
import AcceptFriendSuccessDialog from "./Acceptfriendsuccessdialog";

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

  const fetchRequests = async () => {
    try {
      const res = await axios.get("http://localhost:5120/api/friends/requests/pending", {
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
    try {
      const endpoint = accept ? "accept" : "decline";
      await axios.post(`http://localhost:5120/api/friends/${endpoint}`, { friendshipId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(requests.filter(r => r.friendshipId !== friendshipId));

      const myUid = sessionStorage.getItem("userId");
      if (myUid) {
        await remove(ref(realtimeDb, `friendRequests/${myUid}/${requesterId}`));
      }

      if (accept) {
        setAcceptedFriend(username);
      }
    } catch (err) {
      alert("Lỗi phản hồi lời mời");
    }
  };

  if (loading) return <p className="text-gray-400 italic">Đang tải...</p>;

  return (
    <>
      {requests.length === 0 ? (
        <p className="text-gray-400 italic">Không có lời mời nào.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map(req => (
            <li key={req.friendshipId} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg border border-gray-600">
              <span 
                className="font-medium text-white cursor-pointer hover:text-amber-400 hover:underline transition-colors"
                onClick={() => onAvatarClick && onAvatarClick(req.id)}
              >
                {req.username}
              </span>
              <div className="space-x-2">
                <button 
                  onClick={() => respondRequest(req.friendshipId, true, req.id, req.username)} 
                  className="bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded text-white text-sm font-semibold transition"
                >
                  Chấp nhận
                </button>
                <button 
                  onClick={() => respondRequest(req.friendshipId, false, req.id, req.username)} 
                  className="bg-gray-600 hover:bg-red-500 px-4 py-1.5 rounded text-white text-sm font-semibold transition"
                >
                  Từ chối
                </button>
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
