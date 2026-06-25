"use client";

import { AlertTriangle } from "lucide-react";

interface InviteErrorDialogProps {
    errorMessage: string;
    onClose: () => void;
}

export default function InviteErrorDialog({ errorMessage, onClose }: InviteErrorDialogProps) {
    return (
        <div
            className="fixed inset-0 bg-black/65 z-[100] flex items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-[#1a1c23] border border-red-900/50 rounded-2xl p-6 w-72 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-red-950 flex items-center justify-center mx-auto mb-4 border border-red-800">
                    <AlertTriangle size={24} color="#f87171" strokeWidth={2.5} />
                </div>

                <h3 className="text-base font-bold text-white mb-1">Không thể mời</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    {errorMessage}
                </p>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-500 transition shadow-lg shadow-red-900/40 active:scale-95"
                >
                    Đã hiểu
                </button>
            </div>
        </div>
    );
}
