"use client";

import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { ref, onValue, push, set, remove, query, limitToLast } from "firebase/database";
import { realtimeDb } from "@/lib/firebase";
import axios from "axios";
import { API_URL } from "@/lib/auth";

interface FriendChatProps {
  friend: {
    id: string;
    username: string;
    friendshipId: string;
    avatar?: string;
  };
  token: string;
  onBack: () => void;
}

const playChatSound = (type: "send" | "receive") => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "send") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.08);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(900, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    }
  } catch (err) {
    // blocked or not supported
  }
};

export default function FriendChat({ friend, token, onBack }: FriendChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [presence, setPresence] = useState("Offline");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const myUserId = typeof window !== "undefined" ? sessionStorage.getItem("userId") || "" : "";
  const myUsername = typeof window !== "undefined" ? sessionStorage.getItem("username") || "Đặc vụ" : "Đặc vụ";
  const friendshipId = friend.friendshipId;

  const isOnline = presence === "Online";
  const isInMatch = presence === "In-Match";
  const isInRoom = presence === "In-Room";

  // Cuộn xuống tin nhắn mới nhất
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Lấy danh sách tin nhắn cũ bằng API khi cuộn chuột
  const fetchMessages = async (beforeTimestamp?: number) => {
    try {
      let url = `${API_URL}/api/friends/message/${friendshipId}`;
      if (beforeTimestamp) url += `?beforeTimestamp=${beforeTimestamp}`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      const newMessages = res.data;

      if (newMessages.length < 30) {
        setHasMore(false);
      }

      if (beforeTimestamp) {
        setMessages(prev => {
          const newMap = new Map(prev.map(m => [m.msgId, m]));
          newMessages.forEach((m: any) => newMap.set(m.msgId, m));
          return Array.from(newMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    } catch (err) {
      console.error("Lỗi tải tin nhắn:", err);
    }
  };

  const isInitialLoadRef = useRef(true);

  // Lắng nghe 30 tin nhắn mới nhất từ RTDB để hiển thị tức thì (Instant Load) và Realtime
  useEffect(() => {
    if (!friendshipId) return;

    isInitialLoadRef.current = true;
    const chatRef = query(ref(realtimeDb, `friend_chats/${friendshipId}/messages`), limitToLast(30));

    const unsubscribe = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const msgsList = Object.keys(data).map(key => ({
          msgId: key,
          ...data[key]
        }));
        
        setMessages(prev => {
          // Gộp tin nhắn từ RTDB với danh sách hiện tại (để không làm mất tin nhắn cũ đã tải từ API)
          const newMap = new Map(prev.map(m => [m.msgId, m]));
          
          let hasNewRealtimeMessage = false;
          msgsList.forEach(m => {
            if (!newMap.has(m.msgId)) {
              if (m.senderId !== myUserId) {
                hasNewRealtimeMessage = true;
              }
            }
            newMap.set(m.msgId, m);
          });

          // Nếu có tin nhắn mới hoàn toàn và không phải lần tải đầu, phát âm thanh
          if (!isInitialLoadRef.current && hasNewRealtimeMessage) {
            playChatSound("receive");
          }

          return Array.from(newMap.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
      } else {
        if (isInitialLoadRef.current) setMessages([]);
      }
      
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        setTimeout(scrollToBottom, 50);
      } else {
        setTimeout(scrollToBottom, 50);
      }
    });

    // Dọn dẹp cờ chưa đọc cuộc trò chuyện này
    const myUnreadRef = ref(realtimeDb, `unread_messages/${myUserId}/${friendshipId}`);
    remove(myUnreadRef).catch(console.error);

    return () => {
      unsubscribe();
      remove(myUnreadRef).catch(console.error);
    };
  }, [friendshipId, myUserId]);

  // Xử lý cuộn lên để tải thêm tin nhắn cũ
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      if (messagesContainerRef.current.scrollTop === 0 && !isLoadingMore && hasMore && messages.length > 0) {
        setIsLoadingMore(true);
        const oldestTimestamp = messages[0].timestamp;
        const scrollHeightBefore = messagesContainerRef.current.scrollHeight;
        
        fetchMessages(oldestTimestamp).then(() => {
          setIsLoadingMore(false);
          // Cân bằng lại thanh cuộn
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - scrollHeightBefore;
            }
          }, 0);
        });
      }
    }
  };

  // 2. Lắng nghe sự hiện diện của bạn bè trong cuộc trò chuyện này
  useEffect(() => {
    if (!friend.id) return;

    const presenceRef = ref(realtimeDb, `presence/${friend.id}`);
    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setPresence(data.status || "Offline");
      } else {
        setPresence("Offline");
      }
    });

    return () => unsubscribe();
  }, [friend.id]);

  // Cuộn xuống khi số lượng tin nhắn thay đổi
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Gửi tin nhắn qua Backend API
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !friendshipId || !myUserId) return;

    const textToSend = inputText.trim();
    setInputText("");
    playChatSound("send");

    // Lô-gic Optimistic UI (Hiển thị tin nhắn ngay lập tức giả lập)
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      msgId: tempId,
      senderId: myUserId,
      senderName: myUsername,
      text: textToSend,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 50);

    try {
      await axios.post(`${API_URL}/api/friends/message`, {
        friendshipId: friendshipId,
        text: textToSend,
        targetUserId: friend.id,
        clientMsgId: tempId // Gửi ID này lên Backend C# để làm ID thật luôn
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Không cần xóa tin nhắn tạm nữa, vì Backend C# và RTDB sẽ sử dụng chính ID này
      // Khi RTDB trả về, tin nhắn tạm sẽ tự động bị đè lên và mất đi hiệu ứng mờ (isOptimistic)
    } catch (err: any) {
      console.error("Lỗi gửi tin nhắn:", err);
      // Nếu lỗi, xoá tin nhắn tạm ra khỏi màn hình
      setMessages(prev => prev.filter(m => m.msgId !== tempId));
    }
  };

  return (
    <div className="flex flex-col h-[480px] bg-[#111317] rounded-2xl border border-gray-800 overflow-hidden animate-in slide-in-from-right duration-300">

      {/* HEADER CHAT */}
      <div className="flex items-center justify-between bg-[#171923] px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition active:scale-95 flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </button>

          {/* Avatar nhỏ phát sáng */}
          <div className="relative flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white border-2 ${isOnline
              ? 'border-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.3)]'
              : isInMatch
                ? 'border-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.3)] animate-pulse'
                : 'border-gray-600'
              } bg-gray-900 overflow-hidden`}>
              {friend.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover rounded-full" />
              ) : (
                friend.username ? friend.username.charAt(0).toUpperCase() : "?"
              )}
            </div>
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-[#171923] ${isOnline ? 'bg-emerald-500' : isInMatch ? 'bg-amber-500' : isInRoom ? 'bg-blue-500' : 'bg-gray-500'
              }`}></span>
          </div>

          <div className="min-w-0">
            <h4 className="font-extrabold text-sm text-gray-200 truncate leading-tight">
              {friend.username}
            </h4>
            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">
              {isOnline ? 'Đang online' : isInMatch ? 'Trong trận' : isInRoom ? 'Trong phòng' : 'Ngoại tuyến'}
            </p>
          </div>
        </div>
      </div>

      {/* VÙNG LỊCH SỬ TIN NHẮN */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll flex flex-col bg-[url('/grid-subtle.png')] bg-repeat"
      >
        {isLoadingMore && (
          <div className="flex justify-center my-2">
            <span className="text-xs text-gray-500 bg-gray-900/50 px-3 py-1 rounded-full animate-pulse">
              Đang tải tin nhắn cũ...
            </span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="bg-amber-600/10 p-3 rounded-full text-[#e6a822] mb-2 animate-bounce">
              <Sparkles size={20} />
            </div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
              Gửi mật thư
            </p>
            <p className="text-[10px] text-gray-600 mt-1 max-w-[200px]">
              Gửi mật thư để kết nối với đồng đội.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === myUserId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={msg.msgId}
                className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div className={`px-3.5 py-2.5 rounded-2xl text-xs font-medium leading-relaxed break-words shadow-md border ${isMe
                  ? 'bg-amber-600/90 text-white rounded-tr-none border-amber-500/20'
                  : 'bg-[#1e2130] text-gray-200 rounded-tl-none border-gray-800'
                  }`}>
                  {msg.text}
                </div>

                <span className="text-[9px] text-gray-500 mt-1 px-1 font-bold">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Ô NHẬP TIN NHẮN */}
      <form onSubmit={handleSendMessage} className="p-3 bg-[#171923] border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Nhập mật thư..."
          className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2.5 rounded-xl bg-[#e6a822] disabled:bg-gray-800 text-black disabled:text-gray-500 transition active:scale-95 flex items-center justify-center flex-shrink-0"
        >
          <Send size={14} />
        </button>
      </form>

    </div>
  );
}
