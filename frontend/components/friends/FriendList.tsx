"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import FriendCard from "./FriendCard";
import UnfriendDialog from "./Unfrienddialog";
import InviteSentSuccessDialog from "./Invitesentsuccessdialog";
import { watchFriendPresence } from "@/lib/presence";
import { realtimeDb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

export default function FriendList({ token, onAvatarClick }: { token: string; onAvatarClick?: (id: string) => void }) {
  const [friends, setFriends] = useState<any[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [unfriendTarget, setUnfriendTarget] = useState<any | null>(null);
  const [invitedUser, setInvitedUser] = useState<string | null>(null);

  useEffect(() => {
    const uid = sessionStorage.getItem("userId");
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

  const handleUnfriendClick = (id: string) => {
    const target = friends.find(f => f.id === id);
    if (target) setUnfriendTarget(target);
  };

  const confirmUnfriend = async () => {
    if (!unfriendTarget) return;
    try {
      await axios.delete(`http://localhost:5120/api/friends/${unfriendTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(friends.filter(f => f.id !== unfriendTarget.id));
      setUnfriendTarget(null);
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

  const handleInvite = async (id: string, username: string) => {
    // Check if we are in a room page
    const roomId = window.location.pathname.split("/room/")[1];
    
    if (!roomId) {
      alert("Bạn cần ở trong một phòng để có thể mời bạn bè.");
      return;
    }
    
    try {
      await axios.post("http://localhost:5120/api/friends/invite-room", { 
        targetUserId: id, 
        roomId: roomId 
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvitedUser(username);
    } catch (err: any) {
      alert(err.response?.data?.message || "Lỗi gửi lời mời");
    }
  };

  if (loading) return <div className="space-y-3">
    {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800 animate-pulse rounded-lg border border-gray-700"></div>)}
  </div>;

  // Sắp xếp: Online -> In-Match -> Offline
  const sortedFriends = [...friends].sort((a, b) => {
    const pA = presenceMap[a.id] || "Offline";
    const pB = presenceMap[b.id] || "Offline";
    const order: any = { "Online": 1, "In-Match": 2, "Offline": 3 };
    return (order[pA] || 3) - (order[pB] || 3);
  });

  return (
    <>
      {friends.length === 0 ? (
        <p className="text-gray-400 italic bg-gray-800 p-4 rounded-lg text-center border border-gray-700">Bạn chưa có người bạn nào.</p>
      ) : (
        <div className="space-y-3">
          {sortedFriends.map(friend => (
            <FriendCard 
              key={friend.id} 
              friend={friend} 
              presence={presenceMap[friend.id]} 
              onUnfriend={handleUnfriendClick}
              onBlock={handleBlock}
              onInvite={handleInvite}
              onAvatarClick={onAvatarClick}
            />
          ))}
        </div>
      )}

      {unfriendTarget && (
        <UnfriendDialog 
          username={unfriendTarget.username}
          onConfirm={confirmUnfriend}
          onCancel={() => setUnfriendTarget(null)}
        />
      )}

      {invitedUser && (
        <InviteSentSuccessDialog 
          username={invitedUser}
          onClose={() => setInvitedUser(null)}
        />
      )}
    </>
  );
}
