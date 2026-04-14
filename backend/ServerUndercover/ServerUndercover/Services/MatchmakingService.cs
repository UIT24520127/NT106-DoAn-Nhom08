using System.Collections.Concurrent;

namespace ServerUndercover.Services
{
    public class MatchmakingService
    {
        // Dùng ConcurrentQueue để tránh lỗi khi có nhiều người bấm tìm trận cùng 1 lúc
        private readonly ConcurrentQueue<string> _waitingPlayers = new();

        // Thêm người chơi vào hàng đợi
        public void AddPlayerToQueue(string connectionId)
        {
            if (!_waitingPlayers.Contains(connectionId))
            {
                _waitingPlayers.Enqueue(connectionId);
                Console.WriteLine($"[Matchmaking] Người chơi {connectionId} đang tìm trận. Đang đợi: {_waitingPlayers.Count}/5");
            }
        }

        // Kiểm tra xem có đủ 5 người không, nếu đủ thì rút ra để tạo phòng
        public List<string>? TryFormMatch()
        {
            if (_waitingPlayers.Count >= 5)
            {
                var matchedPlayers = new List<string>();
                for (int i = 0; i < 5; i++)
                {
                    if (_waitingPlayers.TryDequeue(out string playerId))
                    {
                        matchedPlayers.Add(playerId);
                    }
                }
                return matchedPlayers; // Trả về danh sách 5 người chơi
            }
            return null; // Chưa đủ người
        }

        // Hủy tìm trận
        public void RemovePlayer(string connectionId)
        {
            // Trong thực tế cần logic dọn dẹp queue, nhưng với ConcurrentQueue 
            // người ta thường giữ nguyên và chỉ lọc ra khi họ ngắt kết nối.
        }
    }
}