"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import FriendCard from "./FriendCard";
import { watchFriendPresence } from "@/lib/presence";
import { realtimeDb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

export default function FriendList({ token }: { token: string }) {
  const [friends, setFriends] = useState<any[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;

    setLoading(true);
    const friendsRef = ref(realtimeDb, `friends/${uid}`);
    const unsubscribe = onValue(friendsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const friendsArray = Object.values(data);
        setFriends(friendsArray);
      } else {
        setFriends([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (friends.length === 0) return;

    const uids = friends.map(f => f.id);
    const unsubscribe = watchFriendPresence(uids, (uid, status) => {
      setPresenceMap(prev => ({ ...prev, [uid]: status }));
    });

    return () => unsubscribe();
  }, [friends]);

  const handleUnfriend = async (id: string) => {
    if (!confirm("Bạn có chắc muốn hủy kết bạn?")) return;
    try {
      await axios.delete(`http://localhost:5120/api/friends/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(friends.filter(f => f.id !== id));
    } catch (err) {
      alert("Lỗi hủy kết bạn");
    }
  };

  const handleBlock = async (id: string) => {
    if (!confirm("Bạn có chắc muốn chặn người này?")) return;
    try {
      await axios.post("http://localhost:5120/api/friends/block", { targetUserId: id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(friends.filter(f => f.id !== id));
    } catch (err) {
      alert("Lỗi chặn");
    }
  };

  const handleInvite = (id: string) => {
    alert("Chức năng mời bạn vào phòng sẽ được tích hợp với Room Context!");
  };

  if (loading) return <div className="space-y-3">
    {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800 animate-pulse rounded-lg border border-gray-700"></div>)}
  </div>;

  if (friends.length === 0) return <p className="text-gray-400 italic bg-gray-800 p-4 rounded-lg text-center border border-gray-700">Bạn chưa có người bạn nào.</p>;

  // Sắp xếp: Online -> In-Match -> Offline
  const sortedFriends = [...friends].sort((a, b) => {
    const pA = presenceMap[a.id] || "Offline";
    const pB = presenceMap[b.id] || "Offline";
    const order: any = { "Online": 1, "In-Match": 2, "Offline": 3 };
    return (order[pA] || 3) - (order[pB] || 3);
  });

  return (
    <div className="space-y-3">
      {sortedFriends.map(friend => (
        <FriendCard 
          key={friend.id} 
          friend={friend} 
          presence={presenceMap[friend.id]} 
          onUnfriend={handleUnfriend}
          onBlock={handleBlock}
          onInvite={handleInvite}
        />
      ))}
    </div>
  );
}
