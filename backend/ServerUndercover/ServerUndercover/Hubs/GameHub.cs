using Microsoft.AspNetCore.SignalR;

namespace UndercoverServer.Hubs
{
    // Kế thừa Hub là có ngay các hàm Realtime
    public class GameHub : Hub
    {
        // Khi client kết nối
        public override async Task OnConnectedAsync()
        {
            Console.WriteLine($"Người chơi đã kết nối: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }

        // Frontend sẽ gọi hàm này để tạo phòng
        public async Task CreateRoom()
        {
            string roomPin = "123456"; // Sinh random mã PIN
            await Groups.AddToGroupAsync(Context.ConnectionId, roomPin);

            // Bắn mã PIN về lại cho người vừa tạo
            await Clients.Caller.SendAsync("RoomCreated", roomPin);
        }
    }
}