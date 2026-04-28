"use client";

import { Users } from "lucide-react";

interface AcceptFriendSuccessDialogProps {
    username: string;
    onClose: () => void;
}

export default function AcceptFriendSuccessDialog({ username, onClose }: AcceptFriendSuccessDialogProps) {
    return (
        <div
            className="absolute inset-0 bg-black/65 z-10 flex items-center justify-center rounded-3xl"
            onClick={onClose}
        >
            <div
                className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-6 w-72 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-amber-950 flex items-center justify-center mx-auto mb-4">
                    <Users size={26} color="#e6a822" strokeWidth={2.5} />
                </div>

                <h3 className="text-base font-bold text-white mb-1">Kết bạn thành công! 🎉</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    Bạn và{" "}
                    <span className="text-amber-400 font-bold">{username}</span>
                    {" "}đã trở thành bạn bè.
                    <br />Hãy cùng nhau chinh chiến thôi!
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-br from-amber-600 to-amber-500 text-white text-xs font-bold hover:from-amber-500 hover:to-amber-400 transition shadow-lg shadow-amber-900/40"
                >
                    Tuyệt vời!
                </button>
            </div>
        </div>
    );
}