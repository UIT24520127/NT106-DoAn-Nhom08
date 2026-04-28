"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { realtimeDb } from "@/lib/firebase";
import { ref, remove } from "firebase/database";

export default function FriendRequests({ 
  token, 
  pendingCount 
}: { 
  token: string;
  pendingCount?: number;
}) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const respondRequest = async (friendshipId: string, accept: boolean, requesterId: string) => {
    try {
      const endpoint = accept ? "accept" : "decline";
      await axios.post(`http://localhost:5120/api/friends/${endpoint}`, { friendshipId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(requests.filter(r => r.friendshipId !== friendshipId));

      const myUid = localStorage.getItem("userId");
      if (myUid) {
        await remove(ref(realtimeDb, `friendRequests/${myUid}/${requesterId}`));
      }
    } catch (err) {
      alert("Lỗi phản hồi lời mời");
    }
  };

  if (loading) return <p className="text-gray-400 italic">Đang tải...</p>;
  if (requests.length === 0) return <p className="text-gray-400 italic">Không có lời mời nào.</p>;

  return (
    <ul className="space-y-3">
      {requests.map(req => (
        <li key={req.friendshipId} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg border border-gray-600">
          <span className="font-medium text-white">{req.username}</span>
          <div className="space-x-2">
            <button 
              onClick={() => respondRequest(req.friendshipId, true, req.id)} 
              className="bg-green-600 hover:bg-green-500 px-4 py-1.5 rounded text-white text-sm font-semibold transition"
            >
              Chấp nhận
            </button>
            <button 
              onClick={() => respondRequest(req.friendshipId, false, req.id)} 
              className="bg-gray-600 hover:bg-red-500 px-4 py-1.5 rounded text-white text-sm font-semibold transition"
            >
              Từ chối
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
