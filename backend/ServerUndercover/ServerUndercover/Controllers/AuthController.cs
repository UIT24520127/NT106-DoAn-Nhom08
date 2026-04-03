using Microsoft.AspNetCore.Mvc;
using Firebase.Auth;
using ServerUndercover.Models.DTOs;
using Google.Cloud.Firestore;

namespace ServerUndercover.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly FirebaseAuthClient _client;
        private readonly FirestoreDb _db;

        public AuthController(FirebaseAuthClient client, FirestoreDb db)
        {
            _client = client;
            _db = db;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password) || string.IsNullOrEmpty(request.Username))
                return BadRequest(new { message = "Vui lòng nhập đầy đủ Email, Mật khẩu và Tên hiển thị!" });

            try
            {
                var userCredential = await _client.CreateUserWithEmailAndPasswordAsync(request.Email, request.Password);
                string uid = userCredential.User.Info.Uid;

                DocumentReference docRef = _db.Collection("users").Document(uid);
                await docRef.SetAsync(new
                {
                    username = request.Username,
                    totalGames = 0,
                    wins = 0,
                    mostPlayedRole = "Tân binh",
                    createdAt = Timestamp.GetCurrentTimestamp()
                });
                return Ok(new { message = "Đăng ký thành công!", uid = userCredential.User.Info.Uid });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Email đã tồn tại hoặc không hợp lệ!", error = ex.Message });
            }
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
                return BadRequest(new { message = "Vui lòng nhập đầy đủ thông tin!" });

            try
            {
                var result = await _client.SignInWithEmailAndPasswordAsync(request.Email, request.Password);
                return Ok(new
                {
                    message = "Đăng nhập thành công!",
                    token = await result.User.GetIdTokenAsync(),
                    uid = result.User.Info.Uid
                });
            }
            catch (Exception)
            {
                return BadRequest(new { message = "Sai Email hoặc Mật khẩu!" });
            }
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            if (string.IsNullOrEmpty(request.Email))
                return BadRequest(new { message = "Vui lòng cung cấp Email!" });

            try
            {
                // Gọi Firebase gửi email chứa link reset mật khẩu
                await _client.ResetEmailPasswordAsync(request.Email);
                return Ok(new { message = "Đã gửi liên kết khôi phục. Vui lòng kiểm tra hộp thư Email của bạn!" });
            }
            catch (Exception)
            {
                return BadRequest(new { message = "Email không tồn tại trong hệ thống!" });
            }
        }
    }
}