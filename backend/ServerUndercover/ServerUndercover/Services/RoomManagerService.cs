using System.Collections.Concurrent;
using ServerUndercover.Models.State;

namespace ServerUndercover.Services
{
    public class RoomManagerService
    {
        // Danh sách các phòng đang hoạt động (RoomId -> Room)
        private readonly ConcurrentDictionary<string, Room> _rooms = new();
        
        // Theo dõi xem một User đang ở phòng nào (UserId -> RoomId)
        private readonly ConcurrentDictionary<string, string> _userRooms = new();

        // Theo dõi Session của User (UserId -> ConnectionId)
        private readonly ConcurrentDictionary<string, string> _userConnections = new();

        #region Connection Management

        public string? RegisterConnection(string userId, string connectionId)
        {
            _userConnections.TryGetValue(userId, out string? oldConnectionId);
            _userConnections[userId] = connectionId;

            // Nếu người dùng đang ở trong 1 phòng, cập nhật lại ConnectionId của họ trong phòng đó
            if (_userRooms.TryGetValue(userId, out string? roomId) && _rooms.TryGetValue(roomId, out Room? room))
            {
                if (room.Players.TryGetValue(userId, out RoomPlayer? player))
                {
                    player.ConnectionId = connectionId;
                }
            }

            return oldConnectionId; // Trả về old connection để Hub gửi lệnh ForceLogout
        }

        public void RemoveConnection(string userId)
        {
            _userConnections.TryRemove(userId, out _);
        }

        public string? GetConnectionId(string userId)
        {
            _userConnections.TryGetValue(userId, out string? connectionId);
            return connectionId;
        }

        #endregion

        #region Room Management

        public Room? GetRoom(string roomId)
        {
            _rooms.TryGetValue(roomId, out Room? room);
            return room;
        }

        public string? GetUserRoomId(string userId)
        {
            _userRooms.TryGetValue(userId, out string? roomId);
            return roomId;
        }

        public Room? CreateRoom(string hostId, string displayName, bool isPublic, GameSettings settings, out string errorMessage)
        {
            errorMessage = string.Empty;

            // Kiểm tra Validation Logic
            if (settings.MaxBlackHats + settings.MaxWhiteHats >= settings.MaxPlayers)
            {
                errorMessage = "Tổng số Mũ đen và Mũ trắng phải nhỏ hơn Tổng số người chơi ít nhất 1 (để có Dân).";
                return null;
            }
            if (settings.MaxPlayers < 3 || settings.MaxPlayers > 15)
            {
                errorMessage = "Số lượng người chơi phải từ 3 đến 15.";
                return null;
            }

            // Nếu user đang ở phòng khác, rời phòng đó trước
            LeaveRoom(hostId);

            string roomId = "ROOM-" + Guid.NewGuid().ToString().Substring(0, 5).ToUpper();
            
            var room = new Room
            {
                RoomId = roomId,
                HostId = hostId,
                IsPublic = isPublic,
                Settings = settings,
                State = RoomState.Waiting
            };

            var hostPlayer = new RoomPlayer
            {
                UserId = hostId,
                DisplayName = displayName,
                ConnectionId = GetConnectionId(hostId) ?? string.Empty,
                IsReady = true // Host mặc định ready
            };

            room.Players.TryAdd(hostId, hostPlayer);

            _rooms.TryAdd(roomId, room);
            _userRooms.TryAdd(hostId, roomId);

            return room;
        }

        public Room? JoinRoom(string roomId, string userId, string displayName, out string errorMessage)
        {
            errorMessage = string.Empty;

            if (!_rooms.TryGetValue(roomId, out Room? room))
            {
                errorMessage = "Phòng không tồn tại.";
                return null;
            }

            // Nếu user đã ở trong chính phòng này rồi (VD: refresh trang, accept invite khi đã ở sẵn)
            if (_userRooms.TryGetValue(userId, out string? currentRoomId) && currentRoomId == roomId)
            {
                if (room.Players.TryGetValue(userId, out var existingPlayer))
                {
                    existingPlayer.ConnectionId = GetConnectionId(userId) ?? string.Empty;
                }
                return room;
            }

            if (room.State != RoomState.Waiting)
            {
                errorMessage = "Phòng đang chơi, không thể tham gia.";
                return null;
            }

            if (room.CurrentPlayerCount >= room.Settings.MaxPlayers)
            {
                errorMessage = "Phòng đã đầy.";
                return null;
            }

            if (room.BannedUsers.TryGetValue(userId, out DateTime banExpiration))
            {
                if (DateTime.UtcNow < banExpiration)
                {
                    errorMessage = "Bạn vừa bị đuổi khỏi phòng này. Vui lòng đợi 5 giây để vào lại.";
                    return null;
                }
                else
                {
                    room.BannedUsers.TryRemove(userId, out _);
                }
            }

            // Nếu user đang ở phòng khác, rời phòng đó trước
            LeaveRoom(userId);

            var player = new RoomPlayer
            {
                UserId = userId,
                DisplayName = displayName,
                ConnectionId = GetConnectionId(userId) ?? string.Empty
            };

            room.Players.TryAdd(userId, player);
            _userRooms.TryAdd(userId, roomId);

            return room;
        }

        // Return room if it still exists, null if it was deleted
        public Room? LeaveRoom(string userId)
        {
            if (!_userRooms.TryRemove(userId, out string? roomId))
            {
                return null; // Người dùng không ở phòng nào
            }

            if (_rooms.TryGetValue(roomId, out Room? room))
            {
                room.Players.TryRemove(userId, out _);

                // Dọn dẹp phòng rác (Cleanup)
                if (room.Players.IsEmpty)
                {
                    _rooms.TryRemove(roomId, out _);
                    return null; // Báo hiệu phòng đã bị xóa
                }

                // Host Migration
                if (room.HostId == userId)
                {
                    // Chọn người đầu tiên trong danh sách làm Host mới
                    var nextHost = room.Players.Values.FirstOrDefault();
                    if (nextHost != null)
                    {
                        room.HostId = nextHost.UserId;
                        nextHost.IsReady = true; // Host luôn ready
                    }
                }
                return room;
            }
            return null;
        }

        public IEnumerable<object> GetPublicRoomsSummary()
        {
            return _rooms.Values
                .Where(r => r.IsPublic && r.State == RoomState.Waiting)
                .Select(r => new
                {
                    r.RoomId,
                    r.HostId,
                    PlayerCount = r.CurrentPlayerCount,
                    r.Settings.MaxPlayers,
                    r.Settings.MaxBlackHats,
                    r.Settings.MaxWhiteHats
                })
                .ToList();
        }

        public string? FindBestPublicRoomToAutoJoin(string userId)
        {
            // Lấy các phòng chờ công khai chưa đầy và không bị ban
            var availableRooms = _rooms.Values
                .Where(r => r.IsPublic && r.State == RoomState.Waiting && r.CurrentPlayerCount < r.Settings.MaxPlayers)
                .Where(r => !r.BannedUsers.TryGetValue(userId, out var exp) || DateTime.UtcNow >= exp)
                .ToList();

            if (!availableRooms.Any()) return null;

            // Ưu tiên phòng có >= 5 người
            var highlyPopulatedRooms = availableRooms.Where(r => r.CurrentPlayerCount >= 5).ToList();
            if (highlyPopulatedRooms.Any())
            {
                return highlyPopulatedRooms.OrderByDescending(r => r.CurrentPlayerCount).First().RoomId;
            }

            // Nếu không có, chọn phòng đông nhất hiện có
            return availableRooms.OrderByDescending(r => r.CurrentPlayerCount).First().RoomId;
        }

        #endregion
    }
}
