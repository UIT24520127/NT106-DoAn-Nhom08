"use client";

export default function FriendCard({ friend, presence, onUnfriend, onBlock, onInvite }: any) {
  const isOnline = presence === "Online";
  const isInMatch = presence === "In-Match";
  
  return (
    <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg shadow border border-gray-700 hover:border-gray-500 transition-colors">
      <div className="flex items-center space-x-3">
        <div className="relative">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center text-xl font-bold text-gray-900">
            {friend.username ? friend.username.charAt(0).toUpperCase() : "?"}
          </div>
          <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-gray-800 ${
            isOnline ? 'bg-green-500' : isInMatch ? 'bg-blue-500' : 'bg-gray-500'
          }`}></div>
        </div>
        <div>
          <p className="font-semibold text-white">{friend.username}</p>
          <p className={`text-xs ${isOnline ? 'text-green-400' : isInMatch ? 'text-blue-400' : 'text-gray-400'}`}>
            {presence || "Offline"}
          </p>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {isOnline && (
          <button 
            onClick={() => onInvite(friend.id)} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition"
          >
            Mời phòng
          </button>
        )}
        <div className="relative group">
          <button className="text-gray-400 hover:text-white px-2 py-1 rounded-md hover:bg-gray-700 transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          <div className="absolute right-0 mt-1 w-36 bg-gray-900 rounded-md shadow-xl py-1 z-10 hidden group-hover:block border border-gray-700">
            <button 
              onClick={() => onUnfriend(friend.id)} 
              className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition"
            >
              Hủy kết bạn
            </button>
            <button 
              onClick={() => onBlock(friend.id)} 
              className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition"
            >
              Chặn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
