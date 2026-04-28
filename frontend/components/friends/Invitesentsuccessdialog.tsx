"use client";

import { Send } from "lucide-react";

interface InviteSentSuccessDialogProps {
    username: string;
    onClose: () => void;
}

export default function InviteSentSuccessDialog({ username, onClose }: InviteSentSuccessDialogProps) {
    return (
        <div
            className="fixed inset-0 bg-black/65 z-[100] flex items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-6 w-72 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-indigo-950 flex items-center justify-center mx-auto mb-4">
                    <Send size={24} color="#818cf8" strokeWidth={2.5} className="ml-1" />
                </div>

                <h3 className="text-base font-bold text-white mb-1">Đã gửi lời mời!</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    Đã gửi lời mời chơi đến{" "}
                    <span className="text-indigo-400 font-bold">{username}</span>.
                    <br />Hãy chờ người ấy đồng ý nhé!
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-lg shadow-indigo-900/40"
                >
                    Tuyệt vời!
                </button>
            </div>
        </div>
    );
}
