using Google.Cloud.Firestore;

namespace ServerUndercover.Services
{
    public class UserService : IUserService
    {
        private readonly FirestoreDb _firestore;

        public UserService(FirestoreDb firestore)
        {
            _firestore = firestore; // FirestoreDb được cấu hình từ trước
        }

        public async Task<object> GetUserProfile(string userId)
        {
            userId = userId.Trim(); // Thêm dòng này để loại bỏ khoảng trắng thừa
            Console.WriteLine($"--- DEBUG: Đang tim ID: '{userId}' tại collection 'users'");
            DocumentReference docRef = _firestore.Collection("users").Document(userId);
            DocumentSnapshot snapshot = await docRef.GetSnapshotAsync();
            Console.WriteLine($"--- DEBUG: Ton tai? {snapshot.Exists}");

            if (snapshot.Exists)
            {
                return snapshot.ToDictionary(); // Lấy data thật từ Firestore
            }
            return null;
        }

        public async Task<bool> UpdateAvatar(string userId, string avatarData)
        {
            userId = userId.Trim();
            DocumentReference docRef = _firestore.Collection("users").Document(userId);
            Dictionary<string, object> updates = new Dictionary<string, object>
            {
                { "avatar", avatarData }
            };
            await docRef.UpdateAsync(updates);
            return true;
        }
    }
}
