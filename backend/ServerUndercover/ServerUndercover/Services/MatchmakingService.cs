using System.Collections.Concurrent;
using System.Linq;

namespace ServerUndercover.Services
{
    public class MatchPlayer
    {
        public string ConnectionId { get; set; }
        public string UserId { get; set; }
    }

    public class MatchmakingService
    {
        // Dùng ConcurrentQueue để chứa cả ConnectionId và UserId
        private readonly ConcurrentQueue<MatchPlayer> _waitingPlayers = new();

        // Thêm người chơi vào hàng đợi
        public bool AddPlayerToQueue(string connectionId, string userId)
        {
            // Đảm bảo không trùng userId trong hàng đợi
            if (!_waitingPlayers.Any(p => p.UserId == userId))
            {
                _waitingPlayers.Enqueue(new MatchPlayer { ConnectionId = connectionId, UserId = userId });
                Console.WriteLine($"[Matchmaking] Người chơi {userId} đang tìm trận. Đang đợi: {_waitingPlayers.Count}/5");
                return true;
            }
            return false;
        }

        // Kiểm tra xem có đủ 5 người không, nếu đủ thì rút ra để tạo phòng
        public List<MatchPlayer>? TryFormMatch()
        {
            if (_waitingPlayers.Count >= 5)
            {
                var matchedPlayers = new List<MatchPlayer>();
                for (int i = 0; i < 5; i++)
                {
                    if (_waitingPlayers.TryDequeue(out var player))
                    {
                        matchedPlayers.Add(player);
                    }
                }
                return matchedPlayers; // Trả về danh sách 5 người chơi
            }
            return null; // Chưa đủ người
        }

        // Hủy tìm trận
        public void RemovePlayer(string userId)
        {
            // Trong thực tế cần logic dọn dẹp queue, nhưng với ConcurrentQueue 
            // người ta thường giữ nguyên và chỉ lọc ra khi họ ngắt kết nối.
        }
    }
}