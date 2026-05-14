using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using ServerUndercover.Services;
using ServerUndercover.Models.State;
using System.Security.Claims;
using Google.Cloud.Firestore;

namespace ServerUndercover.Hubs
{
    [Authorize]
    public class GameHub : Hub
    {
        private readonly RoomManagerService _roomManager;
        private readonly FirestoreDb _db;

        public GameHub(RoomManagerService roomManager, FirestoreDb db)
        {
            _roomManager = roomManager;
            _db = db;
        }

        private string GetUserId()
        {
            return Context.User?.FindFirst("user_id")?.Value ?? string.Empty;
        }
        
        private async Task<string> GetDisplayNameAsync(string userId)
        {
            if (string.IsNullOrEmpty(userId)) return string.Empty;
            
            try 
            {
                var docRef = _db.Collection("users").Document(userId);
                var snapshot = await docRef.GetSnapshotAsync();
                
                if (snapshot.Exists)
                {
                    if (snapshot.TryGetValue("username", out string username)) return username;
                    if (snapshot.TryGetValue("Username", out string usernameCapital)) return usernameCapital;
                }
            }
            catch (Exception) { /* Bỏ qua lỗi, dùng fallback bên dưới */ }
            
            return Context.User?.FindFirst("name")?.Value ?? "Player_" + userId.Substring(0, 4);
        }

        public override async Task OnConnectedAsync()
        {
            string userId = GetUserId();
            if (!string.IsNullOrEmpty(userId))
            {
                // Register session and check if there's an old connection
                string? oldConnectionId = _roomManager.RegisterConnection(userId, Context.ConnectionId);
                
                if (!string.IsNullOrEmpty(oldConnectionId) && oldConnectionId != Context.ConnectionId)
                {
                    // Kick old tab
                    await Clients.Client(oldConnectionId).SendAsync("ForceLogout", "Tài khoản của bạn đã được đăng nhập ở nơi khác.");
                }

                // If user is in a room, re-join the SignalR group
                string? roomId = _roomManager.GetUserRoomId(userId);
                if (!string.IsNullOrEmpty(roomId))
                {
                    await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
                }
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            string userId = GetUserId();
            if (!string.IsNullOrEmpty(userId))
            {
                // Note: Tránh xóa session nếu người dùng vừa mới reconnect (ConnectionId thay đổi).
                // Chỉ xóa nếu ConnectionId hiện tại khớp với ConnectionId sắp bị ngắt.
                if (_roomManager.GetConnectionId(userId) == Context.ConnectionId)
                {
                    LeaveRoomInternal(userId);
                    _roomManager.RemoveConnection(userId);
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task CreateRoom(int maxPlayers, int maxBlackHats, int maxWhiteHats, bool isPublic)
        {
            string userId = GetUserId();
            string displayName = await GetDisplayNameAsync(userId);

            var settings = new GameSettings
            {
                MaxPlayers = maxPlayers,
                MaxBlackHats = maxBlackHats,
                MaxWhiteHats = maxWhiteHats
            };

            var room = _roomManager.CreateRoom(userId, displayName, isPublic, settings, out string errorMessage);

            if (room == null)
            {
                await Clients.Caller.SendAsync("RoomError", errorMessage);
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomId);
            await Clients.Caller.SendAsync("RoomCreated", room);
            await BroadcastPublicRooms();
        }

        public async Task JoinRoom(string roomId)
        {
            string userId = GetUserId();
            string displayName = await GetDisplayNameAsync(userId);

            var room = _roomManager.JoinRoom(roomId, userId, displayName, out string errorMessage);
            if (room == null)
            {
                await Clients.Caller.SendAsync("RoomError", errorMessage);
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomId);
            //await Groups.AddToGroupAsync(Context.ConnectionId, $"voice-{room.RoomId}");
            await Clients.Group(room.RoomId).SendAsync("RoomUpdated", room);
            await Clients.Caller.SendAsync("RoomJoined", room);
            await Clients.Caller.SendAsync("RoomUpdated", room);

            if (room.IsPublic)
            {
                await BroadcastPublicRooms();
            }

            // (Tùy chọn) Thông báo cho mọi người trong phòng biết có người mới vào
            await Clients.Group(roomId).SendAsync("ReceiveMessage", new
            {
                User = "Hệ thống",
                Content = $"Một người chơi đã tham gia phòng.",
                Timestamp = DateTime.Now.ToString("HH:mm")
            });
        }

        public async Task LeaveRoom()
        {
            string userId = GetUserId();
            await LeaveRoomInternal(userId);
        }

        private async Task LeaveRoomInternal(string userId)
        {
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (string.IsNullOrEmpty(roomId)) return;

            string connectionId = _roomManager.GetConnectionId(userId) ?? string.Empty;
            if (!string.IsNullOrEmpty(connectionId))
            {
                await Groups.RemoveFromGroupAsync(connectionId, roomId);
            }

            var updatedRoom = _roomManager.LeaveRoom(userId);

            if (updatedRoom != null) // Room still exists
            {
                await Clients.Group(roomId).SendAsync("RoomUpdated", updatedRoom);
                if (updatedRoom.IsPublic)
                {
                    await BroadcastPublicRooms();
                }
            }
            else // Room was destroyed
            {
                await BroadcastPublicRooms();
            }
        }

        public async Task GetPublicRooms()
        {
            var rooms = _roomManager.GetPublicRoomsSummary();
            await Clients.Caller.SendAsync("PublicRoomsList", rooms);
        }

        private async Task BroadcastPublicRooms()
        {
            // Gửi danh sách cập nhật cho tất cả mọi người (những ai đang ở sảnh sẽ nhận được)
            var rooms = _roomManager.GetPublicRoomsSummary();
            await Clients.All.SendAsync("PublicRoomsList", rooms);
        }

        public async Task PlayNow()
        {
            string userId = GetUserId();
            
            // Tìm phòng public tốt nhất để join
            string? bestRoomId = _roomManager.FindBestPublicRoomToAutoJoin(userId);

            if (bestRoomId != null)
            {
                await JoinRoom(bestRoomId);
            }
            else
            {
                // Không tìm thấy phòng, tự tạo phòng public mới với cấu hình mặc định
                await CreateRoom(6, 1, 1, true);
            }
        }
        
        public async Task ToggleReady(bool isReady)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room != null && room.Players.TryGetValue(userId, out var player))
            {
                if (room.HostId != userId) // Host luôn luôn ready
                {
                    player.IsReady = isReady;
                    await Clients.Group(roomId).SendAsync("RoomUpdated", room);
                }
            }
        }

        public async Task KickPlayer(string targetUserId)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.HostId != userId)
            {
                await Clients.Caller.SendAsync("RoomError", "Bạn không có quyền đuổi người chơi.");
                return;
            }

            if (targetUserId == userId) return; // Không thể tự đuổi mình

            if (room.Players.ContainsKey(targetUserId))
            {
                // Thêm vào danh sách ban 5s
                room.BannedUsers[targetUserId] = DateTime.UtcNow.AddSeconds(5);

                string targetConnectionId = _roomManager.GetConnectionId(targetUserId) ?? string.Empty;
                
                var updatedRoom = _roomManager.LeaveRoom(targetUserId);
                
                if (!string.IsNullOrEmpty(targetConnectionId))
                {
                    await Groups.RemoveFromGroupAsync(targetConnectionId, roomId);
                    await Clients.Client(targetConnectionId).SendAsync("KickedFromRoom", "Bạn đã bị chủ phòng mời ra ngoài.");
                }

                if (updatedRoom != null) // Phòng vẫn còn tồn tại
                {
                    await Clients.Group(roomId).SendAsync("RoomUpdated", updatedRoom);
                    if (updatedRoom.IsPublic)
                    {
                        await BroadcastPublicRooms();
                    }
                }
            }
        }

        public async Task StartGame()
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.HostId != userId)
            {
                await Clients.Caller.SendAsync("RoomError", "Bạn không phải chủ phòng.");
                return;
            }

            // Kiểm tra số người tối thiểu, giả sử ít nhất 3
            if (room.CurrentPlayerCount < 3)
            {
                await Clients.Caller.SendAsync("RoomError", "Cần ít nhất 3 người chơi để bắt đầu.");
                return;
            }

            room.State = RoomState.Playing;
            await Clients.Group(roomId).SendAsync("GameStarted", room);
            await BroadcastPublicRooms(); // Cập nhật để phòng này biến mất khỏi danh sách public
        }

        public async Task GetRoomState(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room != null)
            {
                await Clients.Caller.SendAsync("RoomUpdated", room);
            }
            else
            {
                await Clients.Caller.SendAsync("RoomError", "Phòng không tồn tại hoặc đã bị hủy.");
            }
        }

        public async Task SendMessage(string roomPin, string user, string message)
        {
            // Gửi tin nhắn đến toàn bộ người chơi trong phòng (bao gồm cả người gửi)
            await Clients.Group(roomPin).SendAsync("ReceiveMessage", new
            {
                User = user,
                Content = message,
                Timestamp = DateTime.Now.ToString("HH:mm")
            });
        }

        // =========================
        // Voice Chat
        // =========================

        public async Task StartVoiceChat(string roomId)
        {
            // join group voice riêng
            await Groups.AddToGroupAsync(Context.ConnectionId,$"voice-{roomId}");

            // báo cho người cũ biết có user mới vào voice
            await Clients.OthersInGroup($"voice-{roomId}").SendAsync("UserJoinedVoice",Context.ConnectionId);
        }

        public async Task LeaveVoiceChat(string roomId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId,$"voice-{roomId}");
            await Clients.Group($"voice-{roomId}").SendAsync("PlayerDisconnected",Context.ConnectionId);
        }

        public async Task SendVoiceSignal(string targetConnectionId,string signal)
        {
            await Clients.Client(targetConnectionId).SendAsync("ReceiveSignal",Context.ConnectionId,signal);
        }

        public async Task ToggleMicStatus(string roomId,bool isMuted)
        {
            await Clients.Group($"voice-{roomId}").SendAsync("PlayerMutedStatus",Context.ConnectionId,isMuted);
        }
    }
}