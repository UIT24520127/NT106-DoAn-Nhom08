import React, { useState, useEffect, useRef } from 'react';

interface Message {
  user: string;
  content: string;
  timestamp: string;
}

interface ChatBoxProps {
  connection: any; // SignalR Connection
  roomId: string;
  currentUser: string;
}

const ChatBox = ({ connection, roomId, currentUser }: ChatBoxProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection) {
      // Lắng nghe tin nhắn từ Server
      connection.on("ReceiveMessage", (data: Message) => {
        setMessages((prev) => [...prev, data]);
      });
    }
    // Cleanup khi component bị hủy
    return () => { connection?.off("ReceiveMessage"); };
  }, [connection]);

  // Tự động cuộn xuống khi có tin nhắn mới
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (input.trim() && connection) {
      try {
        // Gọi hàm SendMessage trên Backend
        await connection.invoke("SendMessage", roomId, currentUser, input);
        setInput('');
      } catch (err) {
        console.error("Gửi tin nhắn thất bại: ", err);
      }
    }
  };

  return (
    <div className="flex flex-col h-[500px] w-full max-w-md overflow-hidden
                    bg-gray-950/40 backdrop-blur-xl border border-white/10 
                    rounded-2xl shadow-2xl shadow-black/50">
      
      {/* Header: Phong cách tối giản, chữ vàng nhạt như đèn bàn */}
      <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-yellow-500/80 font-bold">In-Game Communication</span>
          <h2 className="text-white font-medium">Phòng: {roomId}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-400">5 Online</span>
        </div>
      </div>
      
      {/* Danh sách tin nhắn: Làm mờ thanh cuộn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg, index) => {
          const isMe = msg.user === currentUser;
          return (
            <div key={index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-gray-500 mb-1 px-1">
                {msg.user} • {msg.timestamp}
              </span>
              <div className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm
                ${isMe 
                  ? 'bg-blue-600/80 text-white rounded-tr-none border border-white/10' 
                  : 'bg-white/10 text-gray-200 rounded-tl-none border border-white/5'
                }`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Ô nhập liệu: Bo tròn và tối giản */}
      <div className="p-4 bg-black/20 border-t border-white/5 flex gap-2 items-center">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Nhập mật tin..."
          className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 
                     text-sm text-white placeholder-gray-500 focus:outline-none 
                     focus:border-blue-500/50 focus:bg-white/10 transition-all"
        />
        <button 
          onClick={handleSend} 
          className="p-2 w-10 h-10 flex items-center justify-center bg-blue-600 
                     rounded-full hover:bg-blue-500 active:scale-95 transition-all shadow-lg"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white rotate-90">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatBox;