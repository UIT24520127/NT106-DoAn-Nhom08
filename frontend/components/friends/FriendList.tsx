"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_URL } from "@/lib/auth";
import FriendCard from "./FriendCard";
import UnfriendDialog from "./Unfrienddialog";
import InviteSentSuccessDialog from "./Invitesentsuccessdialog";
import InviteErrorDialog from "./InviteErrorDialog";
import { watchFriendPresence } from "@/lib/presence";
import { realtimeDb } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";

// Biến toàn cục lưu cache avatar bạn bè để không bị load lại mỗi khi mở modal
const globalAvatarsCache: Record<string, string> = {};

interface FriendListProps {
  token: string;
  onAvatarClick?: (id: string) => void;
  onChat?: (friend: any) => void;
  showInvite?: boolean;
}

export default function FriendList({ token, onAvatarClick, onChat, showInvite = false }: FriendListProps) {
  const [friends, setFriends] = useState<any[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [avatarsMap, setAvatarsMap] = useState<Record<string, string>>(globalAvatarsCache);
  const [loading, setLoading] = useState(true);
  const [unfriendTarget, setUnfriendTarget] = useState<any | null>(null);
  const [invitedUser, setInvitedUser] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // 1. Lắng nghe danh sách bạn bè
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

  const hasSyncedRef = useRef(false);

  // 1.5 Lấy danh sách avatar của bạn bè từ Backend API (Có dùng Cache để tối ưu)
  useEffect(() => {
    const fetchFriendsAvatars = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/friends`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const map: Record<string, string> = { ...globalAvatarsCache };
        let hasNew = false;
        
        res.data.forEach((f: any) => {
          if (f.id && (f.avatar || f.Avatar)) {
            const avatarUrl = f.avatar || f.Avatar;
            if (map[f.id] !== avatarUrl) {
              map[f.id] = avatarUrl;
              globalAvatarsCache[f.id] = avatarUrl;
              hasNew = true;
            }
          }
        });
        
        if (hasNew) {
          setAvatarsMap(map);
        }
      } catch (err) {
        console.error("Lỗi tải avatar bạn bè:", err);
      }
    };

    if (token) {
      // Kiểm tra xem có người bạn nào chưa có trong cache không
      const missingAvatars = friends.some(f => !globalAvatarsCache[f.id]);
      // Ép gọi API 1 lần đầu tiên để Backend đồng bộ danh sách xuống Firebase RTDB
      if (!hasSyncedRef.current || missingAvatars) {
        hasSyncedRef.current = true;
        fetchFriendsAvatars();
      } else {
        setAvatarsMap({ ...globalAvatarsCache });
      }
    }
  }, [token, friends]);

  // 2. Lắng nghe trạng thái Online/In-Match/Offline của bạn bè
  useEffect(() => {
    if (friends.length === 0) return;

    const uids = friends.map(f => f.id);
    const unsubscribe = watchFriendPresence(uids, (uid, status) => {
      setPresenceMap(prev => ({ ...prev, [uid]: status }));
    });

    return () => unsubscribe();
  }, [friends]);

  // 3. Lắng nghe cờ báo tin nhắn chưa đọc của từng bạn bè
  useEffect(() => {
    const uid = sessionStorage.getItem("userId");
    if (!uid) return;

    const unreadRef = ref(realtimeDb, `unread_messages/${uid}`);
    const unsubscribe = onValue(unreadRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUnreadMap(data); // data có dạng { [friendshipId]: true }
      } else {
        setUnreadMap({});
      }
    });

    return () => unsubscribe();
  }, []);

  const handleUnfriendClick = (id: string) => {
    const target = friends.find(f => f.id === id);
    if (target) setUnfriendTarget(target);
  };

  const confirmUnfriend = async () => {
    if (!unfriendTarget) return;
    try {
      await axios.delete(`${API_URL}/api/friends/${unfriendTarget.id}`, {
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
      await axios.post(`${API_URL}/api/friends/block`, { targetUserId: id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(friends.filter(f => f.id !== id));
    } catch (err) {
      alert("Lỗi chặn");
    }
  };

  const handleInvite = async (id: string, username: string) => {
    const roomId = new URLSearchParams(window.location.search).get('roomId');
    
    if (!roomId) {
      setInviteError("Bạn cần ở trong một phòng để có thể mời bạn bè.");
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/friends/invite-room`, { 
        targetUserId: id, 
        roomId: roomId 
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvitedUser(username);
    } catch (err: any) {
      setInviteError(err.response?.data?.message || "Lỗi gửi lời mời");
    }
  };

  if (loading) return <div className="space-y-3">
    {[1,2,3].map(i => <div key={i} className="h-16 bg-[#1a1c23]/50 animate-pulse rounded-2xl border border-gray-800"></div>)}
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
        <p className="text-gray-400 italic bg-[#111317] p-4 rounded-xl text-center border border-gray-800">
          Bạn chưa có người bạn nào.
        </p>
      ) : (
        <div className="space-y-3">
          {sortedFriends.map(friend => (
            <FriendCard 
              key={friend.id} 
              friend={{ ...friend, avatar: avatarsMap[friend.id] || friend.avatar }} 
              presence={presenceMap[friend.id] || "Offline"} 
              onUnfriend={handleUnfriendClick}
              onBlock={handleBlock}
              onInvite={handleInvite}
              onAvatarClick={onAvatarClick}
              onChat={onChat}
              hasUnread={!!unreadMap[friend.friendshipId]}
              showInvite={showInvite}
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

      {inviteError && (
        <InviteErrorDialog 
          errorMessage={inviteError}
          onClose={() => setInviteError(null)}
        />
      )}
    </>
  );
}
