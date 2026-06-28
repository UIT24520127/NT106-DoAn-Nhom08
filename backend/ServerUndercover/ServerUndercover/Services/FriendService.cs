using Google.Cloud.Firestore;
using ServerUndercover.Models.DTOs;
using Firebase.Database;
using Firebase.Database.Query;
using System.Linq;
using System.Threading.Tasks;

namespace ServerUndercover.Services
{
    public class FriendService
    {
        private readonly FirestoreDb _firestore;
        private readonly FirebaseClient _firebaseClient;

        public FriendService(FirestoreDb firestore, FirebaseClient firebaseClient)
        {
            _firestore = firestore;
            _firebaseClient = firebaseClient;
        }

        public async Task<string> SendFriendRequestAsync(string requesterId, string targetUserId)
        {
            if (requesterId == targetUserId) return "Cannot send friend request to yourself.";

            var friendshipsRef = _firestore.Collection("friendships");

            // Check if relationship already exists
            Query query1 = friendshipsRef.WhereEqualTo("requesterId", requesterId).WhereEqualTo("addresseeId", targetUserId);
            Query query2 = friendshipsRef.WhereEqualTo("requesterId", targetUserId).WhereEqualTo("addresseeId", requesterId);

            var snap1 = await query1.GetSnapshotAsync();
            var snap2 = await query2.GetSnapshotAsync();

            var existingDoc = snap1.Documents.FirstOrDefault() ?? snap2.Documents.FirstOrDefault();
            
            if (existingDoc != null)
            {
                var data = existingDoc.ToDictionary();
                var status = data.ContainsKey("status") ? data["status"].ToString() : "";
                if (status == "accepted") return "Bạn đã là bạn bè với người này.";
                if (status == "pending") return "Đã có lời mời kết bạn đang chờ xử lý.";
                if (status == "blocked") return "Bạn không thể gửi lời mời kết bạn cho người này.";
                return "Relationship already exists.";
            }

            var docId = Guid.NewGuid().ToString();
            var docRef = friendshipsRef.Document(docId);
            await docRef.SetAsync(new
            {
                id = docId,
                requesterId = requesterId,
                addresseeId = targetUserId,
                status = "pending",
                createdAt = Timestamp.FromDateTime(DateTime.UtcNow),
                updatedAt = Timestamp.FromDateTime(DateTime.UtcNow)
            });

            // Ghi vào RTDB: friendRequests/uid_B/uid_A
            await _firebaseClient
                .Child("friendRequests")
                .Child(targetUserId)
                .Child(requesterId)
                .PutAsync(new { timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });

            return string.Empty; // Success
        }

        public async Task<string> RespondFriendRequestAsync(string userId, string friendshipId, bool accept)
        {
            var docRef = _firestore.Collection("friendships").Document(friendshipId);
            var snapshot = await docRef.GetSnapshotAsync();

            if (!snapshot.Exists) return "Không tìm thấy lời mời.";

            var data = snapshot.ToDictionary();
            if (data["addresseeId"].ToString() != userId) return "Không có quyền phản hồi lời mời này.";
            if (data["status"].ToString() != "pending") return "Lời mời không ở trạng thái chờ.";

            string requesterId = data["requesterId"].ToString();

            if (accept)
            {
                await docRef.UpdateAsync(new Dictionary<string, object>
                {
                    { "status", "accepted" },
                    { "updatedAt", Timestamp.FromDateTime(DateTime.UtcNow) }
                });

                // Lấy thông tin user để lưu vào RTDB friends list
                var userDoc = await _firestore.Collection("users").Document(userId).GetSnapshotAsync();
                var requesterDoc = await _firestore.Collection("users").Document(requesterId).GetSnapshotAsync();

                string userName = userDoc.Exists && userDoc.ContainsField("username") ? userDoc.GetValue<string>("username") : "Unknown";
                string requesterName = requesterDoc.Exists && requesterDoc.ContainsField("username") ? requesterDoc.GetValue<string>("username") : "Unknown";

                // Xóa RTDB: friendRequests/uid_B/uid_A
                await _firebaseClient.Child("friendRequests").Child(userId).Child(requesterId).DeleteAsync();
                await _firebaseClient.Child("friendRequests").Child(requesterId).Child(userId).DeleteAsync();

                // Ghi RTDB: friends/uid_A/uid_B
                await _firebaseClient.Child("friends").Child(requesterId).Child(userId).PutAsync(new {
                    id = userId,
                    username = userName,
                    friendshipId = friendshipId
                });

                // Ghi RTDB: friends/uid_B/uid_A
                await _firebaseClient.Child("friends").Child(userId).Child(requesterId).PutAsync(new {
                    id = requesterId,
                    username = requesterName,
                    friendshipId = friendshipId
                });
            }
            else
            {
                await docRef.DeleteAsync(); // Or set status to declined
                await _firebaseClient.Child("friendRequests").Child(userId).Child(requesterId).DeleteAsync();
            }

            return string.Empty;
        }

        public async Task<string> UnfriendAsync(string userId, string targetUserId)
        {
            var friendshipsRef = _firestore.Collection("friendships");
            Query query1 = friendshipsRef.WhereEqualTo("requesterId", userId).WhereEqualTo("addresseeId", targetUserId).WhereEqualTo("status", "accepted");
            Query query2 = friendshipsRef.WhereEqualTo("requesterId", targetUserId).WhereEqualTo("addresseeId", userId).WhereEqualTo("status", "accepted");

            var snap1 = await query1.GetSnapshotAsync();
            var snap2 = await query2.GetSnapshotAsync();

            var docToDelete = snap1.Documents.FirstOrDefault() ?? snap2.Documents.FirstOrDefault();
            if (docToDelete == null) return "Hai người chưa là bạn bè.";

            await docToDelete.Reference.DeleteAsync();

            // Xóa khỏi RTDB friends list
            await _firebaseClient.Child("friends").Child(userId).Child(targetUserId).DeleteAsync();
            await _firebaseClient.Child("friends").Child(targetUserId).Child(userId).DeleteAsync();

            return string.Empty;
        }

        public async Task<string> BlockUserAsync(string userId, string targetUserId)
        {
            if (userId == targetUserId) return "Không thể chặn chính mình.";

            var friendshipsRef = _firestore.Collection("friendships");
            Query query1 = friendshipsRef.WhereEqualTo("requesterId", userId).WhereEqualTo("addresseeId", targetUserId);
            Query query2 = friendshipsRef.WhereEqualTo("requesterId", targetUserId).WhereEqualTo("addresseeId", userId);

            var snap1 = await query1.GetSnapshotAsync();
            var snap2 = await query2.GetSnapshotAsync();

            var existingDoc = snap1.Documents.FirstOrDefault() ?? snap2.Documents.FirstOrDefault();

            if (existingDoc != null)
            {
                await existingDoc.Reference.UpdateAsync(new Dictionary<string, object>
                {
                    { "requesterId", userId }, // The one who blocks is the requester
                    { "addresseeId", targetUserId },
                    { "status", "blocked" },
                    { "updatedAt", Timestamp.FromDateTime(DateTime.UtcNow) }
                });
            }
            else
            {
                var docId = Guid.NewGuid().ToString();
                var docRef = friendshipsRef.Document(docId);
                await docRef.SetAsync(new
                {
                    id = docId,
                    requesterId = userId,
                    addresseeId = targetUserId,
                    status = "blocked",
                    createdAt = Timestamp.FromDateTime(DateTime.UtcNow),
                    updatedAt = Timestamp.FromDateTime(DateTime.UtcNow)
                });
            }

            // Xóa khỏi danh sách bạn bè RTDB
            await _firebaseClient.Child("friends").Child(userId).Child(targetUserId).DeleteAsync();
            await _firebaseClient.Child("friends").Child(targetUserId).Child(userId).DeleteAsync();
            
            // Xóa lời mời kết bạn nếu có
            await _firebaseClient.Child("friendRequests").Child(userId).Child(targetUserId).DeleteAsync();
            await _firebaseClient.Child("friendRequests").Child(targetUserId).Child(userId).DeleteAsync();

            return string.Empty;
        }

        public async Task<List<Dictionary<string, object>>> GetFriendsAsync(string userId)
        {
            var friendshipsRef = _firestore.Collection("friendships");

            Query query1 = friendshipsRef.WhereEqualTo("requesterId", userId).WhereEqualTo("status", "accepted");
            Query query2 = friendshipsRef.WhereEqualTo("addresseeId", userId).WhereEqualTo("status", "accepted");

            var snap1 = await query1.GetSnapshotAsync();
            var snap2 = await query2.GetSnapshotAsync();

            var tasks = snap1.Documents.Concat(snap2.Documents).Select(async doc =>
            {
                var data = doc.ToDictionary();
                string rawFriendId = data["requesterId"].ToString() == userId ? data["addresseeId"].ToString() : data["requesterId"].ToString();
                string friendId = rawFriendId.Trim();

                var userSnap = await _firestore.Collection("users").Document(friendId).GetSnapshotAsync();
                var userInfo = userSnap.Exists ? userSnap.ToDictionary() : new Dictionary<string, object>
                {
                    { "username", "Người chơi ẩn danh (Lỗi dữ liệu)" }
                };
                userInfo["id"] = friendId;
                userInfo["friendshipId"] = data["id"];
                return userInfo;
            });

            var results = await Task.WhenAll(tasks);
            var friendsList = results.ToList();

            // Tự động đồng bộ lại danh sách bạn bè lên RTDB để tránh lỗi mất đồng bộ dữ liệu
            try
            {
                var rtdbFriendsRef = _firebaseClient.Child("friends").Child(userId);
                foreach(var friend in friendsList)
                {
                    await rtdbFriendsRef.Child(friend["id"].ToString()).PutAsync(new {
                        id = friend["id"],
                        username = friend["username"],
                        friendshipId = friend["friendshipId"]
                    });
                }
            }
            catch { /* ignore error during sync */ }

            return friendsList;
        }

        public async Task<List<Dictionary<string, object>>> GetPendingRequestsAsync(string userId)
        {
            var friendshipsRef = _firestore.Collection("friendships");

            Query query = friendshipsRef.WhereEqualTo("addresseeId", userId).WhereEqualTo("status", "pending");
            var snap = await query.GetSnapshotAsync();

            var tasks = snap.Documents.Select(async doc =>
            {
                var data = doc.ToDictionary();
                string rawRequesterId = data["requesterId"].ToString();
                string requesterId = rawRequesterId.Trim();

                var userSnap = await _firestore.Collection("users").Document(requesterId).GetSnapshotAsync();
                var userInfo = userSnap.Exists ? userSnap.ToDictionary() : new Dictionary<string, object>
                {
                    { "username", "Người chơi ẩn danh (Lỗi dữ liệu)" }
                };
                userInfo["id"] = requesterId;
                userInfo["friendshipId"] = data["id"];
                userInfo["createdAt"] = data["createdAt"];
                return userInfo;
            });

            var results = await Task.WhenAll(tasks);
            return results.ToList();
        }
        
        public async Task<List<Dictionary<string, object>>> SearchUsersAsync(string searchQuery, string currentUserId)
        {
            var usersRef = _firestore.Collection("users");
            var snap = await usersRef.WhereGreaterThanOrEqualTo("username", searchQuery)
                                     .WhereLessThanOrEqualTo("username", searchQuery + "\uf8ff")
                                     .Limit(20)
                                     .GetSnapshotAsync();
            var results = new List<Dictionary<string, object>>();
            foreach (var doc in snap.Documents)
            {
                if (doc.Id != currentUserId)
                {
                    var userInfo = doc.ToDictionary();
                    userInfo["id"] = doc.Id;
                    results.Add(userInfo);
                }
            }
            return results;
        }

        public async Task<string> SendMessageAsync(string senderId, SendMessageDto request)
        {
            var userSnap = await _firestore.Collection("users").Document(senderId).GetSnapshotAsync();
            string senderName = userSnap.Exists && userSnap.ContainsField("username") 
                                ? userSnap.GetValue<string>("username") 
                                : "Unknown";

            var msg = new Dictionary<string, object>
            {
                { "senderId", senderId },
                { "senderName", senderName },
                { "text", request.Text },
                { "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }
            };

            var msgRef = string.IsNullOrEmpty(request.ClientMsgId) 
                            ? _firestore.Collection("FriendChats")
                                        .Document(request.FriendshipId)
                                        .Collection("Messages")
                                        .Document()
                            : _firestore.Collection("FriendChats")
                                        .Document(request.FriendshipId)
                                        .Collection("Messages")
                                        .Document(request.ClientMsgId);
            
            // Lấy ID thật sau khi gen để trả về hoặc có thể push thẳng RTDB
            msg["msgId"] = msgRef.Id;

            await msgRef.SetAsync(msg);

            // Ghi vào RTDB để realtime push cho người nhận
            await _firebaseClient.Child("friend_chats")
                                 .Child(request.FriendshipId)
                                 .Child("messages")
                                 .Child(msgRef.Id)
                                 .PutAsync(msg);

            // Cập nhật cờ chưa đọc cho đối phương nếu có TargetUserId
            if (!string.IsNullOrEmpty(request.TargetUserId))
            {
                await _firebaseClient.Child("unread_messages")
                                     .Child(request.TargetUserId)
                                     .Child(request.FriendshipId)
                                     .PutAsync(true);
            }

            return string.Empty;
        }

        public async Task<List<Dictionary<string, object>>> GetMessagesAsync(string friendshipId, long? beforeTimestamp)
        {
            var query = _firestore.Collection("FriendChats")
                                  .Document(friendshipId)
                                  .Collection("Messages")
                                  .OrderByDescending("timestamp");

            if (beforeTimestamp.HasValue)
            {
                query = query.WhereLessThan("timestamp", beforeTimestamp.Value);
            }

            var snapshot = await query.Limit(30).GetSnapshotAsync();
            var results = new List<Dictionary<string, object>>();

            // Vì orderByDescending nên danh sách lấy được là từ mới đến cũ
            // Chúng ta cần đảo ngược lại để hiển thị đúng thứ tự từ trên xuống dưới
            foreach (var doc in snapshot.Documents)
            {
                var dict = doc.ToDictionary();
                dict["msgId"] = doc.Id;
                results.Add(dict);
            }

            results.Reverse(); // Lật ngược lại để cũ ở trên, mới ở dưới
            return results;
        }
    }
}
