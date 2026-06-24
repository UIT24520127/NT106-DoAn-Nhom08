namespace ServerUndercover.Models.State
{
    public class RoomPlayer
    {
        public string UserId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Avatar { get; set; } = string.Empty;
        public bool IsReady { get; set; } = false;
        public string ConnectionId { get; set; } = string.Empty;

        // --- THÊM 3 DÒNG NÀY ĐỂ QUẢN LÝ VÁN ĐẤU ---
        public string Role { get; set; } = "Civilian"; // Civilian hoặc Undercover
        public string Word { get; set; } = string.Empty; // Từ khóa bí mật của người này
        public bool IsEliminated { get; set; } = false; // Trạng thái sống sót
    }
}
