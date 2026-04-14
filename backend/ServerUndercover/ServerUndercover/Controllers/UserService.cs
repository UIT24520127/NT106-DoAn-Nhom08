using Google.Cloud.Firestore;

namespace ServerUndercover.Controllers
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
    }
}
