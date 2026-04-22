using Microsoft.AspNetCore.SignalR;
using ServerUndercover.Services;

namespace ServerUndercover.Hubs
{
    public class GameHub : Hub
    {
        private readonly MatchmakingService _matchmaking;

        // Nhúng cái ông quản lý hàng đợi vào Hub
        public GameHub(MatchmakingService matchmaking)
        {
            _matchmaking = matchmaking;
        }

        // Front-end sẽ gọi hàm này khi người chơi bấm nút "Chơi ngay"
        public async Task FindMatch()
        {
            string playerId = Context.ConnectionId;

            // 1. Cho người chơi vào hàng đợi
            _matchmaking.AddPlayerToQueue(playerId);

            // 2. Server kiểm tra xem đã đủ 5 người chưa
            var matchedPlayers = _matchmaking.TryFormMatch();

            if (matchedPlayers != null)
            {
                // ĐÃ ĐỦ 5 NGƯỜI -> TẠO PHÒNG
                string roomPin = "ROOM-" + Guid.NewGuid().ToString().Substring(0, 5).ToUpper();
                Console.WriteLine($"[Game] Đã tạo phòng {roomPin} cho 5 người chơi!");

                // Gom 5 người này vào chung 1 Room
                foreach (var id in matchedPlayers)
                {
                    await Groups.AddToGroupAsync(id, roomPin);
                }

                // Báo cho cả 5 người biết là trận đã tìm thấy để họ đổi màn hình
                await Clients.Group(roomPin).SendAsync("MatchFound", new { RoomPin = roomPin, Message = "Trận đấu bắt đầu!" });

                // (Tương lai bạn sẽ gọi hàm chia vai trò ở ngay đây)
            }
            else
            {
                // CHƯA ĐỦ NGƯỜI -> Báo người chơi cứ đợi
                await Clients.Caller.SendAsync("WaitingForPlayers", "Đang tìm đối thủ...");
            }
        }
    }
}
    