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
                // Chỉ đánh dấu disconnect nếu ConnectionId hiện tại trùng với ConnectionId sắp bị ngắt.
                if (_roomManager.GetConnectionId(userId) == Context.ConnectionId)
                {
                    _roomManager.MarkDisconnected(userId);
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
            LeaveRoomInternal(userId);
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

            if (room.CurrentPlayerCount < 3)
            {
                await Clients.Caller.SendAsync("RoomError", "Cần ít nhất 3 người chơi để bắt đầu.");
                return;
            }

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

                    if (i < blackHatCount)
                    {
                        player.Role = "BlackHat";
                        player.Word = selectedWords.Undercover;
                    }
                    else if (i < blackHatCount + whiteHatCount)
                    {
                        player.Role = "WhiteHat";
                        player.Word = string.Empty; // Mũ Trắng không có từ khóa
                    }
                    else
                    {
                        player.Role = "Civilian";
                        player.Word = selectedWords.Civilian;
                    }

                    // Gửi từ khóa bí mật riêng tư cho từng người
                    if (!string.IsNullOrEmpty(player.ConnectionId))
                    {
                        await Clients.Client(player.ConnectionId).SendAsync("ReceiveSecretWord", new
                        {
                            role = player.Role,
                            word = player.Word
                        });
                    }
                }

                // ---- Khởi tạo game loop ----
                room.State = RoomState.Playing;
                room.RoundNumber = 1;
                _roomManager.BuildTurnOrder(roomId);

                // Broadcast trạng thái phòng + phase Describing + TurnOrder
                await Clients.Group(roomId).SendAsync("GameStarted", room);
                await Clients.Group(roomId).SendAsync("PhaseChanged", new
                {
                    phase = "Describing",
                    turnOrder = room.TurnOrder,
                    currentTurnIndex = room.CurrentTurnIndex
                });
                await BroadcastPublicRooms();

                Console.WriteLine($"[GAME LOG] Phòng {roomId} bắt đầu ván mới. Thứ tự lượt: {string.Join(", ", room.TurnOrder)}");
            }
            catch (Exception ex)
            {
                await Clients.Caller.SendAsync("RoomError", $"Lỗi hệ thống khi bốc từ khóa: {ex.Message}");
            }
        }

        // =========================
        // GAME LOOP: Describing Phase
        // =========================

        /// <summary>
        /// Người đang lượt gửi từ miêu tả. Server lưu vào lịch sử, broadcast công khai,
        /// rồi tăng lượt. Nếu hết TurnOrder → chuyển sang Voting.
        /// </summary>
        public async Task SubmitDescription(string word)
        {
            string userId = GetUserId();
            string? roomId = _roomManager.GetUserRoomId(userId);
            if (roomId == null) return;

            var room = _roomManager.GetRoom(roomId);
            if (room == null || room.Phase != GamePhase.Describing) return;

            // Chỉ đúng người đang lượt mới được submit
            if (room.CurrentTurnIndex >= room.TurnOrder.Count) return;
            if (room.TurnOrder[room.CurrentTurnIndex] != userId)
            {
                await Clients.Caller.SendAsync("RoomError", "Chưa đến lượt của bạn.");
                return;
            }

            bool roundOver = _roomManager.SubmitDescription(roomId, userId, word);

            // Broadcast từ vừa nói cho cả phòng
            await Clients.Group(roomId).SendAsync("DescriptionSubmitted", new
            {
                userId,
                word,
                currentTurnIndex = room.CurrentTurnIndex
            });

            if (roundOver)
            {
                // Hết lượt miêu tả → chuyển Voting
                _roomManager.StartVotingPhase(roomId);
                await Clients.Group(roomId).SendAsync("PhaseChanged", new
                {
                    phase = "Voting",
                    voteEndTime = room.VoteEndTime
                });
            }
            else
            {
                // Báo lượt tiếp theo
                await Clients.Group(roomId).SendAsync("PhaseChanged", new
                {
                    phase = "Describing",
                    turnOrder = room.TurnOrder,
                    currentTurnIndex = room.CurrentTurnIndex
                });
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

            var result = _roomManager.CastVote(roomId, userId, targetUserId);
            if (!result.Success)
            {
                await Clients.Caller.SendAsync("RoomError", result.ErrorMessage);
                return;
            }

            // Broadcast số phiếu mới real-time
            await Clients.Group(roomId).SendAsync("VoteUpdated", new
            {
                targetUserId,
                voteCount = result.NewVoteCount
            });

            // Kiểm tra xem tất cả đã vote chưa (tự động kết thúc sớm)
            var room = _roomManager.GetRoom(roomId)!;
            int aliveCount = room.Players.Values.Count(p => !p.IsEliminated);
            if (room.Votes.Count >= aliveCount)
            {
                await ResolveVotingPhase(roomId);
            }
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
            if (room == null || room.HostId != userId) return;
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

            if (!resolution.IsDraw)
            {
                // Kiểm tra điều kiện thắng
                var winCheck = _roomManager.CheckWinConditions(roomId);

                // Nếu có Mũ Trắng còn sống và game sắp kết thúc → cho đoán hấp hối
                bool hasAliveWhiteHat = room.Players.Values.Any(p => p.Role == "WhiteHat" && !p.IsEliminated);

                if (winCheck.IsGameOver && hasAliveWhiteHat)
                {
                    // Trigger Đoán Hấp Hối
                    room.Phase = GamePhase.WhiteHatGuess;
                    await Clients.Group(roomId).SendAsync("PhaseChanged", new
                    {
                        phase = "WhiteHatGuess",
                        timeLeft = 30,
                        pendingWinner = winCheck.WinnerRole
                    });
                    return;
                }

                if (winCheck.IsGameOver)
                {
                    room.Phase = GamePhase.GameEnd;
                    room.State = RoomState.Finished;
                    await Clients.Group(roomId).SendAsync("GameEnded", new
                    {
                        winnerRole = winCheck.WinnerRole,
                        reason = winCheck.Reason
                    });
                    return;
                }
            }

            // Chưa ai thắng → bắt đầu vòng Describing mới (sau 3 giây để client hiện kết quả)
            await Task.Delay(3000);
            _roomManager.BuildTurnOrder(roomId);
            await Clients.Group(roomId).SendAsync("PhaseChanged", new
            {
                phase = "Describing",
                turnOrder = room.TurnOrder,
                currentTurnIndex = 0
            });
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

            bool isCorrect = !string.IsNullOrEmpty(civilianWord) &&
                civilianWord.Trim().Equals(guessedWord.Trim(), StringComparison.OrdinalIgnoreCase);

            if (isCorrect)
            {
                // Mũ Trắng thắng!
                room.Phase = GamePhase.GameEnd;
                room.State = RoomState.Finished;
                await Clients.Group(roomId).SendAsync("GameEnded", new
                {
                    winnerRole = "WhiteHat",
                    reason = $"Mũ Trắng đã đoán đúng từ khóa '{civilianWord}'!"
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

                // Kiểm tra lại điều kiện thắng (không còn WhiteHat)
                var winCheck = _roomManager.CheckWinConditions(roomId);
                if (winCheck.IsGameOver)
                {
                    room.Phase = GamePhase.GameEnd;
                    room.State = RoomState.Finished;
                    await Clients.Group(roomId).SendAsync("GameEnded", new
                    {
                        winnerRole = winCheck.WinnerRole,
                        reason = winCheck.Reason
                    });
                }
                else
                {
                    // Tiếp tục game bình thường
                    await Task.Delay(2000);
                    _roomManager.BuildTurnOrder(roomId);
                    await Clients.Group(roomId).SendAsync("PhaseChanged", new
                    {
                        phase = "Describing",
                        turnOrder = room.TurnOrder,
                        currentTurnIndex = 0
                    });
                }
            }
        }

        public async Task GetRoomState(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room != null)
            {
                await Clients.Caller.SendAsync("RoomUpdated", room);
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