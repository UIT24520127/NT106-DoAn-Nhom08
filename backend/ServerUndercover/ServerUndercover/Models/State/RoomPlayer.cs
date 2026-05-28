using System;

namespace ServerUndercover.Models.State
{
    public class RoomPlayer
    {
        public string UserId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public bool IsReady { get; set; } = false;
        public string ConnectionId { get; set; } = string.Empty;
        public bool IsConnected { get; set; } = false;
        public DateTime? DisconnectedAt { get; set; }

        // --- Trạng thái ván đấu ---
        public string Role { get; set; } = "Civilian"; // "Civilian" | "BlackHat" | "WhiteHat"
        public string Word { get; set; } = string.Empty; // Từ khóa bí mật
        public bool IsEliminated { get; set; } = false; // Đã bị loại

        // --- Vote ---
        /// <summary>Số phiếu nhận được trong vòng vote hiện tại (real-time)</summary>
        public int VoteCount { get; set; } = 0;

        // --- Lịch sử miêu tả ---
        /// <summary>Danh sách các từ/cụm từ đã miêu tả từ đầu game, broadcast công khai</summary>
        public List<string> DescriptionHistory { get; set; } = new();
    }
}
