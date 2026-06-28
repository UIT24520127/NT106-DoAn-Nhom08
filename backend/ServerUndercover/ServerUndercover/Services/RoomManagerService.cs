using System.Collections.Concurrent;
using ServerUndercover.Models.State;
using Firebase.Database;
using Firebase.Database.Query;
using Microsoft.Extensions.Configuration;

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

        // Thành viên voice chat của mỗi phòng (RoomId -> tập ConnectionId đang trong voice)
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _voiceMembers = new();

        public List<string> GetVoiceMembers(string roomId)
            => _voiceMembers.TryGetValue(roomId, out var set) ? set.Keys.ToList() : new List<string>();

        public void AddVoiceMember(string roomId, string connectionId)
            => _voiceMembers.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, byte>())[connectionId] = 0;

        public void RemoveVoiceMember(string roomId, string connectionId)
        {
            if (_voiceMembers.TryGetValue(roomId, out var set)) set.TryRemove(connectionId, out _);
        }

        public void RemoveVoiceMemberEverywhere(string connectionId)
        {
            foreach (var set in _voiceMembers.Values) set.TryRemove(connectionId, out _);
        }

        //Cấp từ khi bắt đầu ván mới, xóa khi ván kết thúc
        private readonly List<WordPair> _localWordPool = new(); // Kho từ tạm thời trên RAM

        // Trí nhớ các cặp từ ĐÃ TỪNG sinh ra (kể cả đã tiêu thụ) -> tránh sinh trùng lại.
        // Khóa được chuẩn hóa (trim + thường hóa + sắp xếp) nên (A,B) và (B,A) coi là một.
        // Mọi truy cập tới _seenPairKeys đều nằm trong lock (_localWordPool).
        private readonly HashSet<string> _seenPairKeys = new(StringComparer.OrdinalIgnoreCase);
        private readonly FirebaseClient _firebaseClient;
        private readonly IHttpClientFactory _httpClientFactory;

        // Khóa Gemini đọc từ config (User Secrets / biến môi trường) - KHÔNG hard-code, KHÔNG commit.
        private readonly string _geminiApiKey;

        // Constructor nhận FirebaseClient, IHttpClientFactory và IConfiguration từ DI
        public RoomManagerService(Firebase.Database.FirebaseClient firebaseClient, IHttpClientFactory httpClientFactory, IConfiguration config)
        {
            _firebaseClient = firebaseClient;
            _httpClientFactory = httpClientFactory;

            // Ưu tiên config "Gemini:ApiKey" (appsettings.Development.json / User Secrets / env Gemini__ApiKey),
            // nếu rỗng thì thử biến môi trường GEMINI_API_KEY. Rỗng/null đều coi như CHƯA cấu hình.
            _geminiApiKey = new[]
            {
                config["Gemini:ApiKey"],
                Environment.GetEnvironmentVariable("GEMINI_API_KEY")
            }.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s)) ?? string.Empty;

            // Kích hoạt nạp từ khóa từ Firebase lên RAM ngầm ngay khi Server khởi động (dotnet run)
            _ = InitializeWordPoolAsync();
        }

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
                    player.IsConnected = true;
                    player.DisconnectedAt = null;
                }
            }

            return oldConnectionId; // Trả về old connection để Hub gửi lệnh ForceLogout
        }

        public void MarkDisconnected(string userId)
        {
            if (_userRooms.TryGetValue(userId, out string? roomId) && _rooms.TryGetValue(roomId, out Room? room))
            {
                if (room.Players.TryGetValue(userId, out RoomPlayer? player))
                {
                    player.ConnectionId = string.Empty;
                    player.IsConnected = false;
                    player.DisconnectedAt = DateTime.UtcNow;
                }
            }
        }

        public void RemoveConnection(string userId, string connectionId)
        {
            if (_userConnections.TryGetValue(userId, out string? currentConnectionId))
            {
                if (currentConnectionId == connectionId)
                {
                    _userConnections.TryRemove(userId, out _);
                }
            }
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

        public Room? CreateRoom(string hostId, string displayName, string avatar, bool isPublic, GameSettings settings, out string errorMessage)
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
                Avatar = avatar,
                ConnectionId = GetConnectionId(hostId) ?? string.Empty,
                IsConnected = true,
                IsReady = true // Host mặc định ready
            };

            room.Players.TryAdd(hostId, hostPlayer);

            _rooms.TryAdd(roomId, room);
            _userRooms.TryAdd(hostId, roomId);

            return room;
        }

        public Room? JoinRoom(string roomId, string userId, string displayName, string avatar, out string errorMessage)
        {
            errorMessage = string.Empty;

            if (!_rooms.TryGetValue(roomId, out Room? room))
            {
                errorMessage = "Phòng không tồn tại.";
                return null;
            }

            // Nếu user đã ở trong chính phòng này rồi (VD: refresh trang, reconnect khi đang chơi)
            if (_userRooms.TryGetValue(userId, out string? currentRoomId) && currentRoomId == roomId)
            {
                if (room.Players.TryGetValue(userId, out var existingPlayer))
                {
                    // Nếu đang ở trong phòng chơi, chỉ cho reconnect khi game chưa qua quá nhiều giai đoạn
                    if (room.State == RoomState.Playing && !existingPlayer.IsConnected)
                    {
                        if (room.Phase == GamePhase.WhiteHatGuess || room.Phase == GamePhase.GameEnd)
                        {
                            // Người chơi đã bỏ lỡ quá nhiều, loại khỏi trò chơi để tránh join lại khi đã qua phần mô tả/vote
                            LeaveRoom(userId);
                            errorMessage = "Bạn đã bỏ lỡ phần mô tả và vote. Hãy vào phòng chờ để chơi ván tiếp theo.";
                            return null;
                        }
                    }

                    existingPlayer.ConnectionId = GetConnectionId(userId) ?? string.Empty;
                    existingPlayer.IsConnected = true;
                    existingPlayer.DisconnectedAt = null;
                    existingPlayer.Avatar = avatar;
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
                Avatar = avatar,
                ConnectionId = GetConnectionId(userId) ?? string.Empty,
                IsConnected = true
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

        #region Word Pair Management

        /// <summary>
        /// Hàm khởi tạo: Tải chính xác mảng từ đang lưu trên Firebase Realtime Database về RAM
        /// </summary>
        private async Task InitializeWordPoolAsync()
        {
            try
            {
                var wordsArray = await _firebaseClient
                    .Child("WordBank/AvailableWords")
                    .OnceSingleAsync<List<WordPair>>();

                // Lịch sử các cặp đã từng sinh (để không sinh lại sau khi server khởi động lại)
                List<string>? seenKeys = null;
                try
                {
                    seenKeys = await _firebaseClient
                        .Child("WordBank/SeenKeys")
                        .OnceSingleAsync<List<string>>();
                }
                catch { /* Không có lịch sử cũng không sao */ }

                if (wordsArray != null && wordsArray.Any())
                {
                    int validCount;
                    bool hadDuplicates;
                    List<WordPair> poolSnapshot;
                    List<string> seenSnapshot;

                    lock (_localWordPool)
                    {
                        _localWordPool.Clear();
                        _seenPairKeys.Clear();

                        // Nạp lịch sử cũ trước
                        if (seenKeys != null)
                            foreach (var k in seenKeys)
                                if (!string.IsNullOrWhiteSpace(k)) _seenPairKeys.Add(k);

                        // Nạp kho hiện tại, tự lọc trùng NGAY TRONG danh sách tải về
                        var poolKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        validCount = 0;
                        foreach (var w in wordsArray)
                        {
                            if (!IsValidPair(w)) continue;
                            validCount++;
                            var key = NormalizePairKey(w);
                            if (poolKeys.Add(key)) // chưa có trong kho hiện tại
                            {
                                _localWordPool.Add(w);
                                _seenPairKeys.Add(key);
                            }
                        }

                        hadDuplicates = _localWordPool.Count < validCount;
                        poolSnapshot = new List<WordPair>(_localWordPool);
                        seenSnapshot = new List<string>(_seenPairKeys);
                    }

                    Console.WriteLine($"[WORD-INIT] 🎉 Nạp {poolSnapshot.Count} cặp từ (đã lọc trùng) từ Firebase. Lịch sử: {seenSnapshot.Count} khóa.");

                    // Nếu kho trên Firebase đang chứa cặp trùng -> ghi đè lại bản đã làm sạch
                    if (hadDuplicates)
                    {
                        Console.WriteLine("[WORD-INIT] Phát hiện cặp trùng trên Firebase, đang ghi lại bản đã làm sạch...");
                        await SyncToFirebaseAsync(poolSnapshot, seenSnapshot);
                    }
                }
                else
                {
                    Console.WriteLine("[WORD-INIT] Kho từ trên Firebase trống hoặc lỗi. Tiến hành sạc kho qua API...");
                    await RefillFirebaseFromSampleWordsAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WORD-ERROR] Lỗi khởi tạo kho từ từ Firebase: {ex.Message}");
                Console.WriteLine("[WORD-ERROR] Tự động kích hoạt sạc lại từ API để cứu vãn...");
                await RefillFirebaseFromSampleWordsAsync();
            }
        }

        // Thêm 1 biến cờ ở đầu class RoomManagerService
        private bool _isRefilling = false;

        public async Task<WordPair> GetAndRemoveWordPairAsync()
        {
            WordPair selectedPair;
            bool needRefill = false;
            List<WordPair>? syncSnapshot = null;

            lock (_localWordPool)
            {
                if (!_localWordPool.Any())
                {
                    Console.WriteLine("[WORD-WARNING] Kho từ trống rỗng trên RAM! Trả về từ khẩn cấp.");
                    return new WordPair { Civilian = "Quả táo", Undercover = "Quả lê" };
                }

                int randomIndex = new Random().Next(_localWordPool.Count);
                selectedPair = _localWordPool[randomIndex];
                _localWordPool.RemoveAt(randomIndex);

                // TỐI ƯU: Nếu kho từ dưới 20 từ VÀ hệ thống chưa đi xin Google, thì mới bật cờ đi xin
                if (_localWordPool.Count < 20 && !_isRefilling)
                {
                    needRefill = true;
                    _isRefilling = true; // Khóa lại ngay lập tức, phòng khác không được gọi trùng
                }
                else
                {
                    // Chụp snapshot NGAY TRONG lock để tránh ghi Firebase từ list đang bị thread khác sửa
                    syncSnapshot = new List<WordPair>(_localWordPool);
                }
            }

            // Thực hiện gọi API ngầm không giữ chân luồng (Không dùng await ở đây)
            if (needRefill)
            {
                _ = Task.Run(async () => {
                    try
                    {
                        await RefillFirebaseFromSampleWordsAsync();
                    }
                    finally
                    {
                        _isRefilling = false; // Xử lý xong (Thành công hoặc Thất bại) thì mở khóa cờ
                    }
                });
            }
            else if (syncSnapshot != null)
            {
                // Đồng bộ danh sách bớt từ lên Firebase bình thường (ghi đè bằng snapshot ổn định)
                _ = _firebaseClient.Child("WordBank/AvailableWords").PutAsync(syncSnapshot);
            }

            return selectedPair;
        }

        /// <summary>
        /// SỬA ĐỔI: Hàm sạc từ bằng cách gọi Google API (Google Cloud Function) trả về JSON
        /// </summary>
        private async Task RefillFirebaseFromSampleWordsAsync()
        {
            // Thiếu key -> không gọi Gemini, dùng kho dự phòng luôn (tránh request 400/403 vô ích).
            if (string.IsNullOrWhiteSpace(_geminiApiKey))
            {
                Console.WriteLine("[GEMINI-ERROR] ⚠️ Chưa cấu hình GEMINI API KEY. Hãy đặt 'Gemini:ApiKey' (User Secrets) hoặc biến môi trường GEMINI_API_KEY. Tạm dùng kho dự phòng.");
                await LoadFallbackSampleWordsAsync();
                return;
            }

            try
            {
                var httpClient = _httpClientFactory.CreateClient();

                string geminiUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={_geminiApiKey}";

                var requestBody = new
                {
                    contents = new[]
                    {
                new { parts = new[] { new { 
                    text = @"Bạn là một chuyên gia thiết kế câu đố cho game Undercover (Kẻ ẩn danh). 
                    Hãy tạo ra 30 cặp từ khóa tiếng Việt độc đáo, ngẫu nhiên và đa dạng chủ đề.

                    ⚠️ QUY TẮC TẠO TỪ KHÓA BẮT BUỘC (QUYẾT ĐỊNH SỰ SỐNG CÒN CỦA GAME):
                    1. 'civilian' (Dân thường) và 'undercover' (Kẻ ẩn danh) phải là HAI THỰC THỂ CÙNG CẤP, thuộc cùng một nhóm phân loại lớn nhưng KHÔNG ĐƯỢC bao hàm nhau.
                    2. TUYỆT ĐỐI KHÔNG được chọn từ khóa theo kiểu 'Từ cha - Từ con' (Ví dụ SAI: Trái cây - Quả táo, Động vật - Con chó, Nước uống - Cà phê).
                    3. Ví dụ ĐÚNG về cặp từ cùng cấp (không dùng lại những từ này): 
                       - [""civilian"": ""Quả Táo"", ""undercover"": ""Quả Lê""] (Cùng là trái cây dạng quả tròn)
                       - [""civilian"": ""Bút chì"", ""undercover"": ""Bút bi""] (Cùng là dụng cụ viết)
                       - [""civilian"": ""Mùa xuân"", ""undercover"": ""Mùa thu""] (Cùng là mùa trong năm)
                       - [""civilian"": ""Hà Nội"", ""undercover"": ""TP. Hồ Chí Minh""] (Cùng là thành phố lớn)
                    4. TUYỆT ĐỐI KHÔNG được đưa lại 4 cặp ví dụ ở mục 3 (Quả Táo/Quả Lê, Bút chì/Bút bi, Mùa xuân/Mùa thu, Hà Nội/TP. Hồ Chí Minh) vào kết quả. Các ví dụ đó CHỈ để minh họa quy tắc, KHÔNG phải đáp án.
                    5. Hãy sinh các cặp KHÁC HOÀN TOÀN, sáng tạo và đa dạng chủ đề (ẩm thực, địa danh, đồ vật, nghề nghiệp, con vật, thể thao, công nghệ, phim ảnh...).

                    Định dạng trả về bắt buộc phải là một mảng JSON thô thuần túy, không nằm trong khối nháy markdown (không kèm ```json), không giải thích hay chào hỏi gì thêm. 
                    Cấu trúc mảng chuẩn: [{""civilian"":""Từ_Dân_Thường"",""undercover"":""Từ_Kẻ_Ẩn_Danh""}]"                } } }
            }
                };

                var jsonPayload = System.Text.Json.JsonSerializer.Serialize(requestBody);
                var content = new StringContent(jsonPayload, System.Text.Encoding.UTF8, "application/json");

                var response = await httpClient.PostAsync(geminiUrl, content);

                if (response.IsSuccessStatusCode)
                {
                    var responseJson = await response.Content.ReadAsStringAsync();

                    using (var doc = System.Text.Json.JsonDocument.Parse(responseJson))
                    {
                        var aiResponseText = doc.RootElement
                            .GetProperty("candidates")[0]
                            .GetProperty("content")
                            .GetProperty("parts")[0]
                            .GetProperty("text")
                            .GetString()?.Trim() ?? string.Empty;

                        if (aiResponseText.StartsWith("```"))
                        {
                            aiResponseText = aiResponseText.Replace("```json", "").Replace("```", "").Trim();
                        }

                        var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                        var apiWords = System.Text.Json.JsonSerializer.Deserialize<List<WordPair>>(aiResponseText, options);

                        if (apiWords != null && apiWords.Any())
                        {
                            int addedCount;
                            List<WordPair> poolSnapshot;
                            List<string> seenSnapshot;

                            lock (_localWordPool)
                            {
                                int before = _localWordPool.Count;
                                // TryAddPairUnlocked đã lọc trùng với cả kho hiện tại LẪN lịch sử đã sinh
                                foreach (var word in apiWords)
                                    TryAddPairUnlocked(word);

                                addedCount = _localWordPool.Count - before;
                                poolSnapshot = new List<WordPair>(_localWordPool);
                                seenSnapshot = new List<string>(_seenPairKeys);
                            }

                            // Ghi đè kho + lịch sử lên Firebase bằng snapshot ổn định (PutAsync thay thế toàn bộ node)
                            await SyncToFirebaseAsync(poolSnapshot, seenSnapshot);

                            Console.WriteLine($"[GEMINI-AI] 🤖 AI sinh {apiWords.Count} cặp. Đã lọc và nạp thêm {addedCount} cặp mới. Tổng kho RAM: {poolSnapshot.Count}");
                            return;
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"[GEMINI-ERROR] Google API báo lỗi HTTP: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GEMINI-ERROR] Thất bại khi xử lý sinh từ: {ex.Message}");
            }

            await LoadFallbackSampleWordsAsync();
        }

        /// <summary>
        /// Kho từ dự phòng khẩn cấp khi Google API hoặc kết nối internet gặp sự cố.
        /// Lọc trùng nên gọi nhiều lần cũng không nhồi lặp cặp từ vào kho/Firebase.
        /// </summary>
        private async Task LoadFallbackSampleWordsAsync()
        {
            Console.WriteLine("[WORD-REFILL] Đang kích hoạt kho từ dự phòng (Fallback)...");
            var fallbackWords = new List<WordPair>
            {
                new WordPair { Civilian = "Mặt trời", Undercover = "Mặt trăng" },
                new WordPair { Civilian = "Xe máy", Undercover = "Xe đạp" },
                new WordPair { Civilian = "Máy tính", Undercover = "Điện thoại" },
                new WordPair { Civilian = "Con mèo", Undercover = "Con chó" },
                new WordPair { Civilian = "Trà sữa", Undercover = "Cà phê" }
            };

            int addedCount;
            List<WordPair> poolSnapshot;
            List<string> seenSnapshot;

            lock (_localWordPool)
            {
                int before = _localWordPool.Count;
                foreach (var word in fallbackWords)
                    TryAddPairUnlocked(word);

                addedCount = _localWordPool.Count - before;
                poolSnapshot = new List<WordPair>(_localWordPool);
                seenSnapshot = new List<string>(_seenPairKeys);
            }

            Console.WriteLine($"[WORD-REFILL] Fallback nạp thêm {addedCount} cặp mới (đã lọc trùng). Tổng kho RAM: {poolSnapshot.Count}");
            await SyncToFirebaseAsync(poolSnapshot, seenSnapshot);
        }

        // ===================== Helper: lọc trùng & đồng bộ =====================

        /// <summary>Chuẩn hóa cặp từ thành 1 khóa duy nhất (trim + thường hóa + sắp xếp 2 từ).</summary>
        private static string NormalizePairKey(WordPair w)
        {
            string a = (w.Civilian ?? string.Empty).Trim().ToLowerInvariant();
            string b = (w.Undercover ?? string.Empty).Trim().ToLowerInvariant();
            return string.CompareOrdinal(a, b) <= 0 ? $"{a}|{b}" : $"{b}|{a}";
        }

        /// <summary>Cặp hợp lệ: cả hai từ không rỗng và không trùng nhau.</summary>
        private static bool IsValidPair(WordPair? w)
        {
            if (w == null) return false;
            string a = (w.Civilian ?? string.Empty).Trim();
            string b = (w.Undercover ?? string.Empty).Trim();
            return a.Length > 0 && b.Length > 0 && !a.Equals(b, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Thêm 1 cặp vào kho nếu hợp lệ và CHƯA TỪNG xuất hiện (so cả kho hiện tại lẫn lịch sử).
        /// Bắt buộc gọi bên trong lock (_localWordPool). Trả về true nếu đã thêm.
        /// </summary>
        private bool TryAddPairUnlocked(WordPair w)
        {
            if (!IsValidPair(w)) return false;
            string key = NormalizePairKey(w);
            if (!_seenPairKeys.Add(key)) return false; // đã thấy -> bỏ qua
            _localWordPool.Add(w);
            return true;
        }

        /// <summary>Ghi đè kho từ hiện tại và lịch sử khóa lên Firebase (best-effort).</summary>
        private async Task SyncToFirebaseAsync(List<WordPair> poolSnapshot, List<string> seenSnapshot)
        {
            try
            {
                await _firebaseClient.Child("WordBank/AvailableWords").PutAsync(poolSnapshot);
                await _firebaseClient.Child("WordBank/SeenKeys").PutAsync(seenSnapshot);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WORD-SYNC-ERROR] Lỗi đồng bộ kho từ lên Firebase: {ex.Message}");
            }
        }

        #endregion

        #region Game Loop

        /// <summary>
        /// Xáo trộn và tạo mảng TurnOrder từ danh sách người còn sống.
        /// Gọi mỗi khi bắt đầu vòng Describing mới.
        /// </summary>
        public void BuildTurnOrder(string roomId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room)) return;

            var alivePlayers = room.Players.Values
                .Where(p => !p.IsEliminated)
                .Select(p => p.UserId)
                .OrderBy(_ => Guid.NewGuid()) // Shuffle
                .ToList();

            room.TurnOrder = alivePlayers;
            room.CurrentTurnIndex = 0;
            room.Phase = GamePhase.Describing;
        }

        /// <summary>
        /// Chuyển sang phase Voting: reset phiếu, tính VoteEndTime.
        /// </summary>
        public void StartVotingPhase(string roomId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room)) return;

            // Reset votes và VoteCount
            room.Votes.Clear();
            foreach (var p in room.Players.Values)
                p.VoteCount = 0;
                
            room.ExtendVoteRequests.Clear();
            room.HasExtendedVote = false;
            room.SkipVoteRequests.Clear();

            room.Phase = GamePhase.Voting;
            // Dùng Unix milliseconds để client dễ đồng bộ
            room.VoteEndTime = DateTimeOffset.UtcNow.AddSeconds(room.Settings.VoteDuration).ToUnixTimeMilliseconds();
        }

        public record VoteCastResult(bool Success, int NewVoteCount, string ErrorMessage);

        /// <summary>
        /// Ghi nhận một phiếu vote. Mỗi người chỉ vote 1 lần, không được vote cho mình / người chết.
        /// Trả về số phiếu mới nhất của target.
        /// </summary>
        public VoteCastResult CastVote(string roomId, string voterId, string targetId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room))
                return new VoteCastResult(false, 0, "Phòng không tồn tại.");

            if (room.Phase != GamePhase.Voting)
                return new VoteCastResult(false, 0, "Hiện không phải phase vote.");

            if (voterId == targetId)
                return new VoteCastResult(false, 0, "Không thể vote cho chính mình.");

            if (targetId != "NO_VOTE" && (!room.Players.TryGetValue(targetId, out var target) || target.IsEliminated))
                return new VoteCastResult(false, 0, "Mục tiêu không hợp lệ.");

            if (room.Votes.ContainsKey(voterId))
                return new VoteCastResult(false, 0, "Bạn đã vote rồi.");

            room.Votes[voterId] = targetId;
            
            int newVoteCount = 0;
            if (targetId != "NO_VOTE" && room.Players.TryGetValue(targetId, out var validTarget))
            {
                validTarget.VoteCount++;
                newVoteCount = validTarget.VoteCount;
            }

            return new VoteCastResult(true, newVoteCount, string.Empty);
        }

        public VoteCastResult ChangeVote(string roomId, string voterId, string targetId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room))
                return new VoteCastResult(false, 0, "Phong khong ton tai.");

            if (room.Phase != GamePhase.Voting)
                return new VoteCastResult(false, 0, "Hien khong phai phase vote.");

            if (voterId == targetId)
                return new VoteCastResult(false, 0, "Khong the vote cho chinh minh.");

            if (targetId != "NO_VOTE" && (!room.Players.TryGetValue(targetId, out var newTarget) || newTarget.IsEliminated))
                return new VoteCastResult(false, 0, "Muc tieu khong hop le.");

            if (!room.Votes.TryGetValue(voterId, out var oldTargetId))
                return new VoteCastResult(false, 0, "Ban chua vote.");

            if (oldTargetId == targetId)
            {
                int currentVoteCount = 0;
                if (targetId != "NO_VOTE" && room.Players.TryGetValue(targetId, out var t)) currentVoteCount = t.VoteCount;
                return new VoteCastResult(true, currentVoteCount, string.Empty);
            }

            if (oldTargetId != "NO_VOTE" && room.Players.TryGetValue(oldTargetId, out var oldTarget) && oldTarget.VoteCount > 0)
            {
                oldTarget.VoteCount--;
            }

            room.Votes[voterId] = targetId;
            
            int newVoteCount = 0;
            if (targetId != "NO_VOTE" && room.Players.TryGetValue(targetId, out var validNewTarget))
            {
                validNewTarget.VoteCount++;
                newVoteCount = validNewTarget.VoteCount;
            }

            return new VoteCastResult(true, newVoteCount, string.Empty);
        }

        public VoteCastResult RevokeVote(string roomId, string voterId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room))
                return new VoteCastResult(false, 0, "Phòng không tồn tại.");

            if (room.Phase != GamePhase.Voting)
                return new VoteCastResult(false, 0, "Hiện không phải phase vote.");

            if (!room.Votes.TryGetValue(voterId, out var oldTargetId))
                return new VoteCastResult(false, 0, "Bạn chưa vote.");

            if (oldTargetId != "NO_VOTE" && room.Players.TryGetValue(oldTargetId, out var oldTarget) && oldTarget.VoteCount > 0)
            {
                oldTarget.VoteCount--;
            }

            room.Votes.TryRemove(voterId, out _);

            return new VoteCastResult(true, 0, string.Empty);
        }

        public record VoteResolution(bool IsDraw, string? EliminatedUserId, string? EliminatedDisplayName);

        /// <summary>
        /// Tổng kết vote: ai nhiều phiếu nhất? Hòa không?
        /// Nếu có người bị loại, đánh dấu IsEliminated = true và tăng RoundNumber.
        /// </summary>
        public VoteResolution ResolveVotes(string roomId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room))
                return new VoteResolution(true, null, null);

            room.RoundNumber++; // Tăng vòng chơi bất kể có ai bị loại hay không

            // Đếm phiếu (loại bỏ phiếu "NO_VOTE")
            var voteCounts = room.Votes.Values
                .Where(v => v != "NO_VOTE")
                .GroupBy(v => v)
                .ToDictionary(g => g.Key, g => g.Count());

            if (!voteCounts.Any())
                return new VoteResolution(true, null, null); // Không ai vote hợp lệ → hòa

            int maxVotes = voteCounts.Values.Max();
            var topPlayers = voteCounts.Where(kv => kv.Value == maxVotes).ToList();

            // Hòa: nhiều người cùng phiếu cao nhất
            if (topPlayers.Count > 1)
                return new VoteResolution(true, null, null);

            // Yêu cầu số phiếu lớn hơn phân nửa số người chơi còn sống VÀ đang kết nối
            int aliveCount = room.Players.Values.Count(p => !p.IsEliminated && p.IsConnected);
            if (maxVotes <= aliveCount / 2)
                return new VoteResolution(true, null, null);

            string eliminatedId = topPlayers[0].Key;
            if (!room.Players.TryGetValue(eliminatedId, out var eliminatedPlayer))
                return new VoteResolution(true, null, null);

            eliminatedPlayer.IsEliminated = true;

            return new VoteResolution(false, eliminatedId, eliminatedPlayer.DisplayName);
        }

        public record WinCheckResult(bool IsGameOver, string? WinnerRole, string Reason);

        public async Task CreateGameSessionAsync(Room room)
        {
            room.CurrentGameSessionId = Guid.NewGuid().ToString("N");
            await _firebaseClient
                .Child("gameSessions")
                .Child(room.RoomId)
                .Child(room.CurrentGameSessionId)
                .PutAsync(new
                {
                    roomId = room.RoomId,
                    status = "playing",
                    phase = room.Phase.ToString(),
                    roundNumber = room.RoundNumber,
                    createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
        }

        public async Task UpdateGameSessionPhaseAsync(Room room)
        {
            try
            {
                if (string.IsNullOrEmpty(room.CurrentGameSessionId)) return;

                await _firebaseClient
                    .Child("gameSessions")
                    .Child(room.RoomId)
                    .Child(room.CurrentGameSessionId)
                    .PatchAsync(new
                    {
                        phase = room.Phase.ToString(),
                        roundNumber = room.RoundNumber,
                        updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Firebase Error] UpdateGameSessionPhaseAsync: {ex.Message}");
            }
        }

        public async Task RecordDescriptionAsync(Room room, string userId, string text, string source, int turnIndex)
        {
            if (string.IsNullOrEmpty(room.CurrentGameSessionId)) return;

            await _firebaseClient
                .Child("gameSessions")
                .Child(room.RoomId)
                .Child(room.CurrentGameSessionId)
                .Child("descriptions")
                .Child(room.RoundNumber.ToString())
                .Child(userId)
                .PutAsync(new
                {
                    text,
                    source,
                    turnIndex,
                    submittedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
        }

        public async Task RecordVoteAsync(Room room, string voterId, string targetId)
        {
            if (string.IsNullOrEmpty(room.CurrentGameSessionId)) return;

            await _firebaseClient
                .Child("gameSessions")
                .Child(room.RoomId)
                .Child(room.CurrentGameSessionId)
                .Child("votes")
                .Child(room.RoundNumber.ToString())
                .Child(voterId)
                .PutAsync(new
                {
                    targetId,
                    submittedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
        }

        public async Task DeleteGameSessionAsync(Room room)
        {
            if (string.IsNullOrEmpty(room.CurrentGameSessionId)) return;

            await _firebaseClient
                .Child("gameSessions")
                .Child(room.RoomId)
                .Child(room.CurrentGameSessionId)
                .DeleteAsync();

            room.CurrentGameSessionId = string.Empty;
        }

        /// <summary>
        /// Kiểm tra 3 điều kiện kết thúc game sau mỗi lần loại người.
        /// Ưu tiên: WhiteHat thắng > BlackHat thắng > Civilian thắng
        /// </summary>
        public WinCheckResult CheckWinConditions(string roomId)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room))
                return new WinCheckResult(false, null, string.Empty);

            var alive = room.Players.Values.Where(p => !p.IsEliminated).ToList();

            int aliveBlackHats = alive.Count(p => p.Role == "BlackHat");
            int aliveWhiteHats = alive.Count(p => p.Role == "WhiteHat");
            int aliveCivilians = alive.Count(p => p.Role == "Civilian");
            int totalAlive = alive.Count;

            // Nếu chỉ còn đúng 2 người sống và có 1 Mũ Trắng
            if (totalAlive == 2 && aliveWhiteHats == 1)
            {
                if (aliveCivilians == 1)
                    return new WinCheckResult(true, "Civilian", "Chỉ còn 1 Dân và 1 Mũ Trắng!");
                if (aliveBlackHats == 1)
                    return new WinCheckResult(true, "BlackHat", "Chỉ còn 1 Mũ Đen và 1 Mũ Trắng!");
            }

            // NẾU MŨ TRẮNG CÒN SỐNG VÀ totalAlive > 2, THÌ GAME CHƯA KẾT THÚC!
            // Cứ vote liên tục cho đến khi Mũ Trắng chết hoặc chỉ còn 2 người.
            if (aliveWhiteHats > 0 && totalAlive > 2)
            {
                return new WinCheckResult(false, null, string.Empty);
            }

            // Các điều kiện bên dưới chỉ áp dụng khi Mũ Trắng ĐÃ CHẾT (aliveWhiteHats == 0) hoặc totalAlive <= 2
            
            // Điều kiện 3: Dân thắng — không còn BlackHat và WhiteHat nào sống
            if (aliveBlackHats == 0 && aliveWhiteHats == 0)
                return new WinCheckResult(true, "Civilian", "Dân thường đã tiêu diệt toàn bộ kẻ thù!");

            // Điều kiện 2: Đen thắng — BlackHat >= Civilian còn sống (và phải có ít nhất 1 BlackHat)
            if (aliveBlackHats > 0 && aliveBlackHats >= aliveCivilians)
                return new WinCheckResult(true, "BlackHat", "Mũ Đen đã chiếm đa số!");

            return new WinCheckResult(false, null, string.Empty);
        }

        /// <summary>
        /// Lưu từ miêu tả vào lịch sử của người chơi, tăng CurrentTurnIndex.
        /// Trả về true nếu đã hết lượt (cần chuyển sang Voting).
        /// </summary>
        public bool SubmitDescription(string roomId, string userId, string word)
        {
            if (!_rooms.TryGetValue(roomId, out Room? room)) return false;
            if (!room.Players.TryGetValue(userId, out var player)) return false;

            player.DescriptionHistory.Add(word);
            room.CurrentTurnIndex++;

            // Kiểm tra đã hết mảng TurnOrder chưa
            return room.CurrentTurnIndex >= room.TurnOrder.Count;
        }

        #endregion
    }
}
