using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using ServerUndercover.Services;
using ServerUndercover.Models.State;
using System.Security.Claims;
using System.Linq;
using Google.Cloud.Firestore;

namespace ServerUndercover.Hubs
{
    [Authorize]
    public class GameHub : Hub
    {
        private readonly RoomManagerService _roomManager;
        private readonly FirestoreDb _db;
        private readonly IHubContext<GameHub> _hubContext;

        public GameHub(RoomManagerService roomManager, FirestoreDb db, IHubContext<GameHub> hubContext)
        {
            _roomManager = roomManager;
            _db = db;
            _hubContext = hubContext;
        }

        private string GetUserId()
        {
            return Context.User?.FindFirst("user_id")?.Value
                ?? Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? string.Empty;
        }
        
        private bool IsRoomHost(Room room, string userId)
        {
            return room != null && !string.IsNullOrEmpty(userId) && room.HostId == userId;
        }
        
        private async Task<(string displayName, string avatar)> GetUserProfileAsync(string userId)
        {
            string displayName = "Player_" + (userId.Length > 4 ? userId.Substring(0, 4) : userId);
            string avatar = string.Empty;

            if (string.IsNullOrEmpty(userId)) return (displayName, avatar);
            
            try 
            {
                var docRef = _db.Collection("users").Document(userId);
                var snapshot = await docRef.GetSnapshotAsync();
                
                if (snapshot.Exists)
                {
                    if (snapshot.TryGetValue("username", out string username)) displayName = username;
                    else if (snapshot.TryGetValue("Username", out string usernameCapital)) displayName = usernameCapital;

                    if (snapshot.TryGetValue("avatar", out string userAvatar)) avatar = userAvatar;
                }
            }
            catch (Exception) { /* Bỏ qua lỗi */ }
            
            return (displayName, avatar);
        }

        private object SanitizePlayer(RoomPlayer player)
        {
            return new
            {
                player.UserId,
                player.DisplayName,
                player.Avatar,
                player.IsReady,
                player.IsConnected,
                player.IsEliminated,
                player.VoteCount,
                player.DescriptionHistory
            };
        }

        private object SanitizeRoom(Room room)
        {
            return new
            {
                roomId = room.RoomId,
                hostId = room.HostId,
                isPublic = room.IsPublic,
                state = room.State.ToString(),
                phase = room.Phase.ToString(),
                settings = room.Settings,
                turnOrder = room.TurnOrder,
                currentTurnIndex = room.CurrentTurnIndex,
                voteEndTime = room.VoteEndTime,
                roundNumber = room.RoundNumber,
                players = room.Players.Values.ToDictionary(p => p.UserId, p => SanitizePlayer(p))
            };
        }

        private Task SendRoomUpdatedToGroup(string roomId, Room room)
        {
            return _hubContext.Clients.Group(roomId).SendAsync("RoomUpdated", SanitizeRoom(room));
        }

        private Task SendRoomUpdatedToCaller(Room room)
        {
            return Clients.Caller.SendAsync("RoomUpdated", SanitizeRoom(room));
        }

        private Task BroadcastTurnOrderGenerated(Room room)
        {
            return Clients.Group(room.RoomId).SendAsync("TurnOrderGenerated", new
            {
                roundNumber = room.RoundNumber,
                turnOrder = room.TurnOrder
            });
        }

        private object CreateLoadingState(Room room)
        {
            var startedAt = room.LoadingStartedAt ?? DateTime.UtcNow;
            return new
            {
                timeoutSeconds = room.LoadingTimeoutSeconds,
                startedAt = new DateTimeOffset(startedAt).ToUnixTimeMilliseconds(),
                readyCount = room.LoadingReadyPlayerIds.Count,
                totalCount = room.Players.Count,
                readyPlayerIds = room.LoadingReadyPlayerIds.Keys.ToArray()
            };
        }

        private Task BroadcastLoadingProgress(Room room)
        {
            return _hubContext.Clients.Group(room.RoomId).SendAsync("LoadingProgressUpdated", new
            {
                readyCount = room.LoadingReadyPlayerIds.Count,
                totalCount = room.Players.Count,
                readyPlayerIds = room.LoadingReadyPlayerIds.Keys.ToArray()
            });
        }

        private async Task SendSecretsToRoom(Room room)
        {
            foreach (var player in room.Players.Values)
            {
                if (!string.IsNullOrEmpty(player.ConnectionId))
                {
                    await _hubContext.Clients.Client(player.ConnectionId).SendAsync("ReceiveSecretWord", new
                    {
                        role = player.Role,
                        word = player.Word
                    });
                }
            }
        }

        private async Task CloseLoadingAndRevealRoles(Room room)
        {
            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", $"DEBUG: CloseLoadingAndRevealRoles entered! Phase: {room.Phase}");
            
            lock (room)
            {
                if (room.LoadingClosed || room.Phase != GamePhase.Loading) 
                {
                    _ = _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", $"DEBUG: Early exit. LoadingClosed: {room.LoadingClosed}, Phase: {room.Phase}");
                    return;
                }
                room.LoadingClosed = true;
            }

            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", $"DEBUG: Past lock. TimedOut Check...");
            var timedOutPlayers = room.Players.Values
                .Where(p => !room.LoadingReadyPlayerIds.ContainsKey(p.UserId))
                .ToList();

            foreach (var player in timedOutPlayers)
            {
                string connectionId = _roomManager.GetConnectionId(player.UserId) ?? player.ConnectionId;
                _roomManager.LeaveRoom(player.UserId);

                if (!string.IsNullOrEmpty(connectionId))
                {
                    await _hubContext.Groups.RemoveFromGroupAsync(connectionId, room.RoomId);
                    await _hubContext.Clients.Client(connectionId).SendAsync(
                        "KickedFromRoom",
                        "Bạn tải tài nguyên quá thời gian sẵn sàng nên đã bị rời khỏi ván. Hãy vào lại phòng để chơi ván sau."
                    );
                }
            }

            if (room.Players.Count < 3)
            {
                await _roomManager.DeleteGameSessionAsync(room);
                room.State = RoomState.Waiting;
                room.Phase = GamePhase.RoleReveal;
                room.LoadingReadyPlayerIds.Clear();
                room.LoadingStartedAt = null;
                room.LoadingClosed = false;
                await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "Không đủ người chơi sẵn sàng để bắt đầu ván.");
                await SendRoomUpdatedToGroup(room.RoomId, room);
                await BroadcastPublicRooms();
                return;
            }

            room.Phase = GamePhase.RoleReveal;
            foreach (var player in room.Players.Values)
            {
                player.IsReady = false;
            }

            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "DEBUG: Updating Session Phase...");
            await _roomManager.UpdateGameSessionPhaseAsync(room);
            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "DEBUG: Broadcasting Loading...");
            await BroadcastLoadingProgress(room);
            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "DEBUG: Sending Room Updated...");
            await SendRoomUpdatedToGroup(room.RoomId, room);
            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "DEBUG: Sending Secrets...");
            await SendSecretsToRoom(room);
            await _hubContext.Clients.Group(room.RoomId).SendAsync("RoomError", "DEBUG: CloseLoadingAndRevealRoles FINISHED!");
        }

        private async Task CloseLoadingAfterTimeout(string roomId, DateTime loadingStartedAt)
        {
            var room = _roomManager.GetRoom(roomId);
            var delaySeconds = room?.LoadingTimeoutSeconds ?? 10;
            await Task.Delay(TimeSpan.FromSeconds(delaySeconds));

            room = _roomManager.GetRoom(roomId);
            if (room == null || room.LoadingStartedAt != loadingStartedAt || room.LoadingClosed)
                return;

            await CloseLoadingAndRevealRoles(room);
        }


        private Task BroadcastTurnStarted(string roomId, Room room)
        {
            if (room.CurrentTurnIndex >= room.TurnOrder.Count)
                return Task.CompletedTask;

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (room.CurrentTurnEndTime <= now)
            {
                room.CurrentTurnEndTime = DateTimeOffset.UtcNow.AddSeconds(room.Settings.DescribeDuration).ToUnixTimeMilliseconds();
            }

            _ = EndTurnAfterTimeout(roomId, room.CurrentTurnIndex, room.CurrentTurnEndTime);

            return _hubContext.Clients.Group(roomId).SendAsync("TurnStarted", new
            {
                currentSpeakerId = room.TurnOrder[room.CurrentTurnIndex],
                currentTurnIndex = room.CurrentTurnIndex,
                duration = room.Settings.DescribeDuration,
                endTime = room.CurrentTurnEndTime
            });
        }

        private async Task EndTurnAfterTimeout(string roomId, int turnIndex, long endTime)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var delayMs = endTime - now;
            if (delayMs > 0)
            {
                await Task.Delay((int)delayMs);
            }

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.Describing || room.CurrentTurnIndex != turnIndex)
                return;

            string currentSpeakerId = room.TurnOrder[turnIndex];

            // Auto submit timeout description
            int submittedTurnIndex = room.CurrentTurnIndex;
            bool roundOver = _roomManager.SubmitDescription(roomId, currentSpeakerId, "(Hết thời gian)");
            await _roomManager.RecordDescriptionAsync(room, currentSpeakerId, "(Hết thời gian)", "typed", submittedTurnIndex);

            await _hubContext.Clients.Group(roomId).SendAsync("DescriptionSubmitted", new
            {
                userId = currentSpeakerId,
                word = "(Hết thời gian)",
                source = "typed",
                roundNumber = room.RoundNumber,
                currentTurnIndex = submittedTurnIndex
            });

            if (roundOver)
            {
                _roomManager.StartVotingPhase(roomId);
                await _roomManager.UpdateGameSessionPhaseAsync(room);
                await BroadcastVotingStarted(roomId, room);
            }
            else
            {
                await _hubContext.Clients.Group(roomId).SendAsync("TurnEnded", new
                {
                    nextTurnIndex = room.CurrentTurnIndex
                });
                await BroadcastTurnStarted(roomId, room);
            }
        }

        private Task SendTurnStartedToCaller(string roomId, Room room)
        {
            if (room.CurrentTurnIndex >= room.TurnOrder.Count)
                return Task.CompletedTask;

            // REMOVED resetting CurrentTurnEndTime here!
            // When F5 reconnecting, it should just receive the existing endTime
            // (even if it's already in the past, client will show 0s)

            return Clients.Caller.SendAsync("TurnStarted", new
            {
                currentSpeakerId = room.TurnOrder[room.CurrentTurnIndex],
                currentTurnIndex = room.CurrentTurnIndex,
                duration = room.Settings.DescribeDuration,
                endTime = room.CurrentTurnEndTime
            });
        }

        private Task BroadcastVotingStarted(string roomId, Room room)
        {
            // Only fire timeout if we just started the vote (time <= now before this call)
            // Wait, we can just ALWAYS fire a background task, the background task will check Phase and Time
            _ = EndVotingAfterTimeout(roomId, room.VoteEndTime);

            return _hubContext.Clients.Group(roomId).SendAsync("VotingStarted", new
            {
                endTime = room.VoteEndTime,
                duration = room.Settings.VoteDuration
            });
        }

        private async Task EndVotingAfterTimeout(string roomId, long endTime)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var delayMs = endTime - now;
            if (delayMs > 0)
            {
                await Task.Delay((int)delayMs);
            }

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.Voting || room.VoteEndTime != endTime)
                return;

            // Timeout hit, resolve votes forcefully
            var resolution = _roomManager.ResolveVotes(roomId);
            await _roomManager.UpdateGameSessionPhaseAsync(room);
            await BroadcastRoundTransition(roomId, room, resolution);
        }

        private Task SendVotingStartedToCaller(string roomId, Room room)
        {
            return Clients.Caller.SendAsync("VotingStarted", new
            {
                endTime = room.VoteEndTime,
                duration = room.Settings.VoteDuration
            });
        }

        private Task BroadcastVoteCounts(string roomId, Room room)
        {
            return Clients.Group(roomId).SendAsync("VoteUpdated", new
            {
                voteCounts = room.Players.Values.ToDictionary(p => p.UserId, p => p.VoteCount)
            });
        }

        private Task BroadcastRoundTransition(string roomId, Room room, RoomManagerService.VoteResolution resolution)
        {
            var alivePlayers = room.Players.Values
                .Where(p => !p.IsEliminated)
                .Select(p => new { p.UserId, p.DisplayName })
                .ToList();

            string? eliminatedRole = null;
            if (resolution.EliminatedUserId != null && room.Players.TryGetValue(resolution.EliminatedUserId, out var eliminatedPlayer))
            {
                eliminatedRole = room.Settings.RevealEliminatedRole ? eliminatedPlayer.Role : null;
            }

            return Clients.Group(roomId).SendAsync("RoundTransitionStarted", new
            {
                roundNumber = room.RoundNumber,
                countdownDuration = room.Settings.RoundTransitionDuration,
                alivePlayers,
                eliminatedPlayer = resolution.IsDraw ? null : new
                {
                    userId = resolution.EliminatedUserId,
                    displayName = resolution.EliminatedDisplayName
                },
                eliminatedPlayerRole = eliminatedRole,
                isTieVote = resolution.IsDraw
            });
        }

        private Task BroadcastPlayerEliminated(string roomId, RoomManagerService.VoteResolution resolution)
        {
            if (resolution.EliminatedUserId == null)
                return Task.CompletedTask;

            return Clients.Group(roomId).SendAsync("PlayerEliminated", new
            {
                userId = resolution.EliminatedUserId,
                displayName = resolution.EliminatedDisplayName
            });
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
                // Chỉ đánh dấu disconnect nếu ConnectionId hiện tại trùng với ConnectionId sắp bị ngắt.
                if (_roomManager.GetConnectionId(userId) == Context.ConnectionId)
                {
                    _roomManager.MarkDisconnected(userId);
                    _roomManager.RemoveConnection(userId, Context.ConnectionId);

                    string? roomId = _roomManager.GetUserRoomId(userId);
                    if (roomId != null)
                    {
                        var room = _roomManager.GetRoom(roomId);
                        if (room != null && (room.State == RoomState.Waiting || room.State == RoomState.Finished))
                        {
                            _roomManager.LeaveRoom(userId);
                            await Clients.Group(roomId).SendAsync("RoomUpdated", room);
                        }
                    }
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task CreateRoom(int maxPlayers, int maxBlackHats, int maxWhiteHats, bool isPublic)
        {
            string userId = GetUserId();
            var profile = await GetUserProfileAsync(userId);

            var settings = new GameSettings
            {
                MaxPlayers = maxPlayers,
                MaxBlackHats = maxBlackHats,
                MaxWhiteHats = maxWhiteHats
            };

            var room = _roomManager.CreateRoom(userId, profile.displayName, profile.avatar, isPublic, settings, out string errorMessage);

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
            var profile = await GetUserProfileAsync(userId);

            var room = _roomManager.JoinRoom(roomId, userId, profile.displayName, profile.avatar, out string errorMessage);
            if (room == null)
            {
                await Clients.Caller.SendAsync("RoomError", errorMessage);
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomId);
            //await Groups.AddToGroupAsync(Context.ConnectionId, $"voice-{room.RoomId}");
            await SendRoomUpdatedToGroup(room.RoomId, room);
            await Clients.Caller.SendAsync("RoomJoined", SanitizeRoom(room));
            await SendRoomUpdatedToCaller(room);

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
                await SendRoomUpdatedToGroup(roomId, updatedRoom);
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
            await _hubContext.Clients.All.SendAsync("PublicRoomsList", rooms);
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
                    await SendRoomUpdatedToGroup(roomId, room);
                }

            }
        }

        private async Task StartGameInternal(Room room)
        {
            string roomId = room.RoomId;
            try
            {
                var selectedWords = await _roomManager.GetAndRemoveWordPairAsync();

                // ---- Chia vai trò theo Settings ----
                var playerList = room.Players.Values.ToList();
                var random = new Random();
                var shuffled = playerList.OrderBy(_ => random.Next()).ToList();

                int blackHatCount = room.Settings.MaxBlackHats;
                int whiteHatCount = room.Settings.MaxWhiteHats;

                for (int i = 0; i < shuffled.Count; i++)
                {
                    var player = shuffled[i];
                    player.IsEliminated = false;
                    player.VoteCount = 0;
                    player.DescriptionHistory = new List<string>();
                    player.IsReady = false; // Reset ready cho phase RoleReveal

                    if (i < blackHatCount)
                    {
                        player.Role = "BlackHat";
                        player.Word = selectedWords.Undercover;
                    }
                    else if (i < blackHatCount + whiteHatCount)
                    {
                        player.Role = "WhiteHat";
                        player.Word = string.Empty;
                    }
                    else
                    {
                        player.Role = "Civilian";
                        player.Word = selectedWords.Civilian;
                    }

                    // Gửi từ khóa bí mật riêng tư cho từng người
                }

                // ---- Chuyển sang phase RoleReveal, CHỜ tất cả bấm sẵn sàng ----
                room.State = RoomState.Playing;
                room.Phase = GamePhase.Loading;
                room.RoundNumber = 1;
                room.LoadingStartedAt = DateTime.UtcNow;
                room.LoadingTimeoutSeconds = 10;
                room.LoadingClosed = false;
                room.LoadingReadyPlayerIds.Clear();
                await _roomManager.CreateGameSessionAsync(room);

                // Broadcast trạng thái ReadyCount ban đầu (0 / totalCount)
                int total = room.Players.Count;
                await Clients.Group(roomId).SendAsync("LoadingPhaseStarted", CreateLoadingState(room));
                await BroadcastLoadingProgress(room);

                await BroadcastPublicRooms();
                _ = CloseLoadingAfterTimeout(roomId, room.LoadingStartedAt.Value);
                Console.WriteLine($"[GAME LOG] Phòng {roomId} đã phân vai. Đang chờ {total} người xác nhận sẵn sàng.");
            }
            catch (Exception ex)
            {
                await Clients.Caller.SendAsync("RoomError", $"Lỗi hệ thống khi bốc từ khóa: {ex.Message}");
            }
        }

        private async Task StartActualGameLoop(Room room)
        {
            string roomId = room.RoomId;
            room.Phase = GamePhase.Describing;
            _roomManager.BuildTurnOrder(roomId);
            await _roomManager.UpdateGameSessionPhaseAsync(room);

            await Clients.Group(roomId).SendAsync("GameStarted", SanitizeRoom(room));
            await BroadcastTurnOrderGenerated(room);
            await BroadcastTurnStarted(roomId, room);

            Console.WriteLine($"[GAME LOG] Phòng {roomId} bắt đầu game loop. Thứ tự lượt: {string.Join(", ", room.TurnOrder)}");
        }

        // =========================
        // PLAYER READY (sau khi xem vai trò)
        // =========================

        public async Task PlayerLoadingReady(string roomId)
        {
            string userId = GetUserId();
            var room = _roomManager.GetRoom(roomId);

            if (room == null || room.Phase != GamePhase.Loading || room.LoadingClosed)
                return;

            if (!room.Players.TryGetValue(userId, out var player))
                return;

            var startedAt = room.LoadingStartedAt ?? DateTime.UtcNow;
            var deadline = startedAt.AddSeconds(room.LoadingTimeoutSeconds);
            if (DateTime.UtcNow > deadline)
            {
                string connectionId = _roomManager.GetConnectionId(userId) ?? player.ConnectionId;
                _roomManager.LeaveRoom(userId);

                if (!string.IsNullOrEmpty(connectionId))
                {
                    await Groups.RemoveFromGroupAsync(connectionId, room.RoomId);
                    await Clients.Client(connectionId).SendAsync(
                        "KickedFromRoom",
                        "Bạn tải tài nguyên quá thời gian sẵn sàng nên đã bị rời khỏi ván. Hãy vào lại phòng để chơi ván sau."
                    );
                }

                await SendRoomUpdatedToGroup(room.RoomId, room);
                if (room.LoadingReadyPlayerIds.Count >= room.Players.Count)
                {
                    await CloseLoadingAndRevealRoles(room);
                }
                return;
            }

            room.LoadingReadyPlayerIds.TryAdd(userId, true);
            await BroadcastLoadingProgress(room);

            if (room.LoadingReadyPlayerIds.Count >= room.Players.Count)
            {
                await CloseLoadingAndRevealRoles(room);
            }
        }

        public async Task PlayerReady()
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.RoleReveal) return;

            if (!room.Players.TryGetValue(userId, out var player)) return;
            if (player.IsReady) return; // Đã sẵn sàng rồi, bỏ qua

            player.IsReady = true;

            int readyCount = room.Players.Values.Count(p => p.IsReady);
            int totalCount = room.Players.Count;

            // Broadcast cập nhật đếm sẵn sàng cho tất cả
            await Clients.Group(roomId).SendAsync("ReadyCountUpdated", new
            {
                readyCount,
                totalCount
            });

            Console.WriteLine($"[GAME LOG] {player.DisplayName} sẵn sàng. {readyCount}/{totalCount}");

            // Khi tất cả sẵn sàng → bắt đầu game loop
            if (readyCount >= totalCount)
            {
                await Clients.Group(roomId).SendAsync("AllPlayersReady");
                await StartActualGameLoop(room);
            }
        }

        public async Task KickPlayer(string targetUserId)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (!IsRoomHost(room, userId))
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
                    await SendRoomUpdatedToGroup(roomId, updatedRoom);
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
            if (!IsRoomHost(room, userId))
            {
                await Clients.Caller.SendAsync("RoomError", "Bạn không phải chủ phòng.");
                return;
            }

            if (room.CurrentPlayerCount < 3)
            {
                await Clients.Caller.SendAsync("RoomError", "Cần ít nhất 3 người chơi để bắt đầu.");
                return;
            }

            await StartGameInternal(room);
        }

        public async Task UpdateRoomSettings(GameSettings newSettings)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (!IsRoomHost(room, userId))
            {
                await Clients.Caller.SendAsync("RoomError", "Bạn không phải chủ phòng.");
                return;
            }

            // Keep max players constraints or other logic if needed
            room.Settings.DescribeDuration = newSettings.DescribeDuration;
            room.Settings.VoteDuration = newSettings.VoteDuration;
            room.Settings.RoundTransitionDuration = newSettings.RoundTransitionDuration;
            room.Settings.RevealEliminatedRole = newSettings.RevealEliminatedRole;
            // MaxPlayers, MaxBlackHats, MaxWhiteHats can also be updated if you UI supports them

            await SendRoomUpdatedToGroup(roomId, room);
        }

        public async Task BackToLobby()
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (!IsRoomHost(room, userId))
            {
                await Clients.Caller.SendAsync("RoomError", "Bạn không phải chủ phòng.");
                return;
            }

            // Reset room to Waiting state
            room.State = RoomState.Waiting;
            room.Phase = GamePhase.RoleReveal;
            room.CurrentGameSessionId = string.Empty;
            room.Votes.Clear();
            room.TurnOrder.Clear();
            room.CurrentTurnIndex = 0;
            room.RoundNumber = 0;
            room.LoadingClosed = false;
            room.LoadingReadyPlayerIds.Clear();
            room.LoadingStartedAt = null;
            room.CurrentTurnEndTime = 0;
            room.VoteEndTime = 0;

            // Reset all players
            foreach (var p in room.Players.Values)
            {
                // Host luôn luôn sẵn sàng, chỉ reset cho người chơi thường
                p.IsReady = (p.UserId == room.HostId);
                p.IsEliminated = false;
                p.VoteCount = 0;
                p.Role = string.Empty;
                p.Word = string.Empty;
                p.DescriptionHistory.Clear();
            }

            await SendRoomUpdatedToGroup(roomId, room);
            await Clients.Group(roomId).SendAsync("ReturnedToLobby");
            await BroadcastPublicRooms();
        }

        /// <summary>
        /// Người đang lượt gửi từ miêu tả. Server lưu vào lịch sử, broadcast công khai,
        /// rồi tăng lượt. Nếu hết TurnOrder → chuyển sang Voting.
        /// </summary>
        public async Task SubmitDescription(string word, string source = "typed")
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.Describing) return;

            word = (word ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(word))
            {
                await Clients.Caller.SendAsync("RoomError", "Vui lòng nhập mô tả trước khi gửi.");
                return;
            }

            source = source == "speech" ? "speech" : "typed";

            // Chỉ đúng người đang lượt mới được submit
            if (room.CurrentTurnIndex >= room.TurnOrder.Count) return;
            if (room.TurnOrder[room.CurrentTurnIndex] != userId)
            {
                await Clients.Caller.SendAsync("RoomError", "Chưa đến lượt của bạn.");
                return;
            }

            int submittedTurnIndex = room.CurrentTurnIndex;
            bool roundOver = _roomManager.SubmitDescription(roomId, userId, word);
            await _roomManager.RecordDescriptionAsync(room, userId, word, source, submittedTurnIndex);

            // Broadcast từ vừa nói cho cả phòng
            await Clients.Group(roomId).SendAsync("DescriptionSubmitted", new
            {
                userId,
                word,
                source,
                roundNumber = room.RoundNumber,
                currentTurnIndex = room.CurrentTurnIndex
            });

            if (roundOver)
            {
                // Hết lượt miêu tả → chuyển Voting
                _roomManager.StartVotingPhase(roomId);
                await _roomManager.UpdateGameSessionPhaseAsync(room);
                await BroadcastVotingStarted(roomId, room);
            }
            else
            {
                // Báo lượt tiếp theo
                await Clients.Group(roomId).SendAsync("TurnEnded", new
                {
                    nextTurnIndex = room.CurrentTurnIndex
                });
                await BroadcastTurnStarted(roomId, room);
            }
        }

        // =========================
        // GAME LOOP: Voting Phase
        // =========================

        /// <summary>
        /// Người chơi gửi phiếu vote. Real-time broadcast số phiếu mới.
        /// Nếu tất cả người sống đã vote → tự động tổng kết.
        /// </summary>
        public async Task CastVote(string targetUserId)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("RoomError", "Phòng không tồn tại.");
                return;
            }

            var result = _roomManager.CastVote(roomId, userId, targetUserId);
            if (!result.Success)
            {
                await Clients.Caller.SendAsync("RoomError", result.ErrorMessage);
                return;
            }

            // Broadcast số phiếu mới real-time
            await _roomManager.RecordVoteAsync(room, userId, targetUserId);
            await BroadcastVoteCounts(roomId, room);

            // Kiểm tra xem tất cả đã vote chưa (tự động kết thúc sớm)
            int aliveCount = room.Players.Values.Count(p => !p.IsEliminated);
            if (room.Votes.Count >= aliveCount)
            {
                await ResolveVotingPhase(roomId);
            }
        }

        public async Task SubmitVote(string targetUserId)
        {
            await CastVote(targetUserId);
        }

        public async Task ChangeVote(string targetUserId)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("RoomError", "Phòng không tồn tại.");
                return;
            }

            var result = _roomManager.ChangeVote(roomId, userId, targetUserId);
            if (!result.Success)
            {
                await Clients.Caller.SendAsync("RoomError", result.ErrorMessage);
                return;
            }

            await _roomManager.RecordVoteAsync(room, userId, targetUserId);
            await BroadcastVoteCounts(roomId, room);
        }

        public async Task UseWhiteHatGuess(string guessedWord)
        {
            await GuessWord(guessedWord);
        }

        public async Task SkipVoting()
        {
            await SkipVote();
        }

        public async Task SkipTurn()
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.Describing) return;
            if (room.CurrentTurnIndex >= room.TurnOrder.Count) return;
            if (room.TurnOrder[room.CurrentTurnIndex] != userId)
            {
                await Clients.Caller.SendAsync("RoomError", "Chưa đến lượt của bạn.");
                return;
            }

            room.CurrentTurnIndex++;
            if (room.CurrentTurnIndex >= room.TurnOrder.Count)
            {
                _roomManager.StartVotingPhase(roomId);
                await BroadcastVotingStarted(roomId, room);
                return;
            }

            await Clients.Group(roomId).SendAsync("TurnSkipped", new
            {
                nextTurnIndex = room.CurrentTurnIndex
            });
            await BroadcastTurnStarted(roomId, room);
        }

        /// <summary>
        /// Chỉ Host mới được Skip vote (bỏ qua vòng, coi như hòa).
        /// </summary>
        public async Task SkipVote()
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return;
            // Cho phép bất kỳ ai bấm Chơi Lại (chuyển về Waiting)
            if (room.State != RoomState.Finished && room.HostId != userId) return;
            if (room.Phase != GamePhase.Voting) return;

            // Skip = tổng kết với votes hiện tại (hoặc hòa nếu chưa ai vote)
            await ResolveVotingPhase(roomId);
        }

        /// <summary>Hàm nội bộ: tổng kết vote, kiểm tra điều kiện thắng, chuyển phase.</summary>
        private async Task ResolveVotingPhase(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return;

            var resolution = _roomManager.ResolveVotes(roomId);

            // Broadcast kết quả vote
            await Clients.Group(roomId).SendAsync("VotingResult", new
            {
                isDraw = resolution.IsDraw,
                eliminatedUserId = resolution.EliminatedUserId,
                eliminatedDisplayName = resolution.EliminatedDisplayName
            });

            if (!resolution.IsDraw && resolution.EliminatedUserId != null)
            {
                var eliminatedPlayer = room.Players[resolution.EliminatedUserId];
                bool isWhiteHatEliminated = eliminatedPlayer.Role == "WhiteHat";

                // Kiểm tra điều kiện thắng
                var winCheck = _roomManager.CheckWinConditions(roomId);

                await BroadcastPlayerEliminated(roomId, resolution);
                await BroadcastRoundTransition(roomId, room, resolution);

                await Task.Delay(room.Settings.RoundTransitionDuration * 1000);

                bool hasAliveWhiteHat = room.Players.Values.Any(p => !p.IsEliminated && p.Role == "WhiteHat");

                if (isWhiteHatEliminated || (winCheck.IsGameOver && hasAliveWhiteHat))
                {
                    room.Phase = GamePhase.WhiteHatGuess;
                    await _roomManager.UpdateGameSessionPhaseAsync(room);
                    await SendRoomUpdatedToGroup(roomId, room);
                    await Clients.Group(roomId).SendAsync("WhiteHatOpportunity", new
                    {
                        pendingWinner = winCheck.WinnerRole,
                        timeLeft = 30
                    });
                    return;
                }

                if (winCheck.IsGameOver)
                {
                    room.Phase = GamePhase.GameEnd;
                    room.State = RoomState.Finished;
                    await _roomManager.DeleteGameSessionAsync(room);
                    await Clients.Group(roomId).SendAsync("GameEnded", new
                    {
                        winner = winCheck.WinnerRole,
                        civilianWord = room.Players.Values.FirstOrDefault(p => p.Role == "Civilian")?.Word,
                        players = room.Players.Values.Select(p => new
                        {
                            userId = p.UserId,
                            displayName = p.DisplayName,
                            role = p.Role,
                            isEliminated = p.IsEliminated
                        }).ToList()
                    });
                    return;
                }
            }
            else
            {
                await BroadcastRoundTransition(roomId, room, resolution);
                await Task.Delay(room.Settings.RoundTransitionDuration * 1000);
            }

            _roomManager.BuildTurnOrder(roomId);
            await _roomManager.UpdateGameSessionPhaseAsync(room);
            await BroadcastTurnOrderGenerated(room);
            await BroadcastTurnStarted(roomId, room);
        }

        // =========================
        // GAME LOOP: WhiteHat Guess
        // =========================

        /// <summary>
        /// Mũ Trắng đoán từ khóa của Dân (dùng cho cả PanicButton và Hấp Hối).
        /// </summary>
        public async Task GuessWord(string guessedWord)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return;

            // Chỉ Mũ Trắng mới được dùng lệnh này
            if (!room.Players.TryGetValue(userId, out var player) || player.Role != "WhiteHat")
            {
                await Clients.Caller.SendAsync("RoomError", "Chỉ Mũ Trắng mới có thể đoán.");
                return;
            }

            // Tìm từ khóa của Dân
            string? civilianWord = room.Players.Values
                .FirstOrDefault(p => p.Role == "Civilian")?.Word;

            bool isCorrect = false;
            if (!string.IsNullOrEmpty(civilianWord) && !string.IsNullOrEmpty(guessedWord))
            {
                // Normalize to handle Vietnamese diacritics robustly (NFC normalization)
                var normCiv = civilianWord.Normalize(System.Text.NormalizationForm.FormC).Trim();
                var normGuess = guessedWord.Normalize(System.Text.NormalizationForm.FormC).Trim();
                isCorrect = string.Compare(normCiv, normGuess, StringComparison.InvariantCultureIgnoreCase) == 0;
            }

            if (isCorrect)
            {
                // Mũ Trắng thắng!
                room.Phase = GamePhase.GameEnd;
                room.State = RoomState.Finished;
                await _roomManager.DeleteGameSessionAsync(room);
                await Clients.Group(roomId).SendAsync("GameEnded", new
                {
                    winner = "WhiteHat",
                    civilianWord = civilianWord,
                    players = room.Players.Values.Select(p => new
                    {
                        userId = p.UserId,
                        displayName = p.DisplayName,
                        role = p.Role,
                        isEliminated = p.IsEliminated
                    }).ToList()
                });
            }
            else
            {
                // Đoán sai → Mũ Trắng bị loại, tiếp tục game
                player.IsEliminated = true;
                await Clients.Group(roomId).SendAsync("WhiteHatGuessResult", new
                {
                    isCorrect = false,
                    displayName = player.DisplayName
                });

                await Clients.Group(roomId).SendAsync("PlayerEliminated", new
                {
                    userId = userId,
                    displayName = player.DisplayName
                });

                // Kiểm tra lại điều kiện thắng (không còn WhiteHat)
                var winCheck = _roomManager.CheckWinConditions(roomId);
                if (winCheck.IsGameOver)
                {
                    room.Phase = GamePhase.GameEnd;
                    room.State = RoomState.Finished;
                    await _roomManager.DeleteGameSessionAsync(room);
                    await Clients.Group(roomId).SendAsync("GameEnded", new
                    {
                        winner = winCheck.WinnerRole,
                        civilianWord = room.Players.Values.FirstOrDefault(p => p.Role == "Civilian")?.Word,
                        players = room.Players.Values.Select(p => new
                        {
                            userId = p.UserId,
                            displayName = p.DisplayName,
                            role = p.Role,
                            isEliminated = p.IsEliminated
                        }).ToList()
                    });
                }
                else
                {
                    // Nếu đang tới lượt của người này, tự động bỏ qua lượt
                    if (room.Phase == GamePhase.Describing && room.CurrentTurnIndex < room.TurnOrder.Count && room.TurnOrder[room.CurrentTurnIndex] == userId)
                    {
                        await SkipTurn();
                    }
                }
            }
        }

        public async Task GetRoomState(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room != null)
            {
                await SendRoomUpdatedToCaller(room);

                string userId = GetUserId();
                if (room.State == RoomState.Playing && room.Phase != GamePhase.Loading && room.Players.TryGetValue(userId, out var player))
                {
                    await Clients.Caller.SendAsync("ReceiveSecretWord", new
                    {
                        role = player.Role,
                        word = player.Word
                    });
                }

                // Đồng bộ phase hiện tại khi client reconnect
                if (room.State == RoomState.Playing)
                {
                    await Clients.Caller.SendAsync("PhaseChanged", new
                    {
                        phase = room.Phase.ToString(),
                        turnOrder = room.TurnOrder,
                        currentTurnIndex = room.CurrentTurnIndex,
                        voteEndTime = room.VoteEndTime
                    });

                    if (room.Phase == GamePhase.Loading)
                    {
                        await Clients.Caller.SendAsync("LoadingPhaseStarted", CreateLoadingState(room));
                        await Clients.Caller.SendAsync("LoadingProgressUpdated", new
                        {
                            readyCount = room.LoadingReadyPlayerIds.Count,
                            totalCount = room.Players.Count,
                            readyPlayerIds = room.LoadingReadyPlayerIds.Keys.ToArray()
                        });
                    }
                    else if (room.Phase == GamePhase.Describing)
                    {
                        await SendTurnStartedToCaller(roomId, room);
                    }
                    else if (room.Phase == GamePhase.Voting)
                    {
                        await SendVotingStartedToCaller(roomId, room);
                    }
                }
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
