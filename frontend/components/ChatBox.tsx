import React, { useState, useEffect, useRef } from 'react';

interface Message {
  user: string;
  content: string;
  timestamp: string;
}

interface ChatBoxProps {
  connection: any; // SignalR Connection
  roomPin: string;
  currentUser: string;
}

const ChatBox = ({ connection, roomPin, currentUser }: ChatBoxProps) => {
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
        await connection.invoke("SendMessage", roomPin, currentUser, input);
        setInput('');
      } catch (err) {
        console.error("Gửi tin nhắn thất bại: ", err);
      }
    }
  };

  return (
    <div className="flex flex-col h-[400px] w-full max-w-md border rounded-lg bg-gray-900 text-white">
      <div className="p-2 bg-gray-800 font-bold border-b border-gray-700">
        Phòng: {roomPin} (5 người chơi)
      </div>
      
      {/* Danh sách tin nhắn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, index) => (
          <div key={index} className={`flex flex-col ${msg.user === currentUser ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-gray-400">{msg.user} - {msg.timestamp}</span>
            <div className={`px-3 py-2 rounded-lg mt-1 ${msg.user === currentUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Ô nhập liệu */}
      <div className="p-3 border-t border-gray-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Nhập tin nhắn..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1 focus:outline-none focus:border-blue-500"
        />
        <button onClick={handleSend} className="bg-blue-600 px-4 py-1 rounded hover:bg-blue-700">
          Gửi
        </button>
      </div>
    </div>
  );
};

export default ChatBox;