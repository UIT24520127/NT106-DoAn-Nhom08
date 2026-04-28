"use client";

interface UnfriendDialogProps {
    username: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function UnfriendDialog({ username, onConfirm, onCancel }: UnfriendDialogProps) {
    return (
        // Overlay
        <div
            className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center"
            onClick={onCancel}
        >
            {/* Popup */}
            <div
                className="bg-[#1a1c23] border border-gray-600 rounded-2xl p-7 w-80 text-center shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-red-950 flex items-center justify-center mx-auto mb-4">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                        stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                </div>

                <h2 className="text-base font-bold text-white mb-2">Hủy kết bạn?</h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                    Bạn có chắc muốn hủy kết bạn với{" "}
                    <span className="text-amber-400 font-bold">{username}</span>?
                    <br />Hành động này không thể hoàn tác.
                </p>

                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 rounded-xl bg-[#111317] text-gray-400 border border-gray-700 text-sm font-semibold hover:bg-gray-800 transition"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-xl bg-red-900 text-red-300 border border-red-800 text-sm font-semibold hover:bg-red-800 transition"
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
}
