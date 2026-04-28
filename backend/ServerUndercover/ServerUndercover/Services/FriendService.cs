using Google.Cloud.Firestore;
using ServerUndercover.Models.DTOs;
using Firebase.Database;
using Firebase.Database.Query;

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
            var friends = new List<Dictionary<string, object>>();

            Query query1 = friendshipsRef.WhereEqualTo("requesterId", userId).WhereEqualTo("status", "accepted");
            Query query2 = friendshipsRef.WhereEqualTo("addresseeId", userId).WhereEqualTo("status", "accepted");

            var snap1 = await query1.GetSnapshotAsync();
            var snap2 = await query2.GetSnapshotAsync();

            foreach (var doc in snap1.Documents.Concat(snap2.Documents))
            {
                var data = doc.ToDictionary();
                string friendId = data["requesterId"].ToString() == userId ? data["addresseeId"].ToString() : data["requesterId"].ToString();

                var userSnap = await _firestore.Collection("users").Document(friendId).GetSnapshotAsync();
                var userInfo = userSnap.Exists ? userSnap.ToDictionary() : new Dictionary<string, object>
                {
                    { "username", "Người chơi ẩn danh (Lỗi dữ liệu)" }
                };
                userInfo["id"] = friendId;
                userInfo["friendshipId"] = data["id"];
                friends.Add(userInfo);
            }
            return friends;
        }

        public async Task<List<Dictionary<string, object>>> GetPendingRequestsAsync(string userId)
        {
            var friendshipsRef = _firestore.Collection("friendships");
            var requests = new List<Dictionary<string, object>>();

            Query query = friendshipsRef.WhereEqualTo("addresseeId", userId).WhereEqualTo("status", "pending");
            var snap = await query.GetSnapshotAsync();

            foreach (var doc in snap.Documents)
            {
                var data = doc.ToDictionary();
                string requesterId = data["requesterId"].ToString();

                var userSnap = await _firestore.Collection("users").Document(requesterId).GetSnapshotAsync();
                var userInfo = userSnap.Exists ? userSnap.ToDictionary() : new Dictionary<string, object>
                {
                    { "username", "Người chơi ẩn danh (Lỗi dữ liệu)" }
                };
                userInfo["id"] = requesterId;
                userInfo["friendshipId"] = data["id"];
                userInfo["createdAt"] = data["createdAt"];
                requests.Add(userInfo);
            }

            return requests;
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
    }
}
