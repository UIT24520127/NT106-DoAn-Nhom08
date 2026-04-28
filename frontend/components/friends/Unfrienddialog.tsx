"use client";

import { UserMinus } from "lucide-react";

interface UnfriendDialogProps {
    username: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function UnfriendDialog({ username, onConfirm, onCancel }: UnfriendDialogProps) {
    return (
        <div
            className="absolute inset-0 bg-black/65 z-10 flex items-center justify-center rounded-3xl"
            onClick={onCancel}
        >
            <div
                className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-6 w-72 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center mx-auto mb-4">
                    <UserMinus size={22} color="#ef4444" strokeWidth={2.5} />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Hủy kết bạn?</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                    Bạn chắc muốn hủy kết bạn với{" "}
                    <span className="text-amber-400 font-bold">{username}</span>?
                    <br />Hành động này không thể hoàn tác.
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 rounded-xl bg-[#111317] text-gray-400 border border-gray-700 text-xs font-semibold hover:bg-gray-800 transition"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 rounded-xl bg-red-900 text-red-300 border border-red-800 text-xs font-semibold hover:bg-red-800 transition"
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
}