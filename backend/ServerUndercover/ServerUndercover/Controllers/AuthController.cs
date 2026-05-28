using Microsoft.AspNetCore.Mvc;
using Firebase.Auth;
using ServerUndercover.Models.DTOs;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Caching.Memory;
using System.Net.Mail;
using System.Net;

namespace ServerUndercover.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly FirebaseAuthClient _client;
        private readonly FirestoreDb _db;
        private readonly IMemoryCache _cache;
        private readonly IConfiguration _config;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            FirebaseAuthClient client,
            FirestoreDb db,
            IMemoryCache cache,
            IConfiguration config,
            ILogger<AuthController> logger)
        {
            _client = client;
            _db = db;
            _cache = cache;
            _config = config;
            _logger = logger;
        }

        [HttpPost("register")]
        public async Task<IActionResult> RequestRegister([FromBody] RegisterRequest request)
        {
            if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password) || string.IsNullOrEmpty(request.Username))
                return BadRequest(new { message = "Vui lòng nhập đầy đủ Email, Mật khẩu và Tên hiển thị!" });

            try
            {
                // 1. Tạo user trong Firebase Auth (Điều này sẽ tự động check user tồn tại trong authentication chính)
                var userCredential = await _client.CreateUserWithEmailAndPasswordAsync(request.Email, request.Password);
                string uid = userCredential.User.Info.Uid;

                // 2. Đẩy vào hàng chờ (Cache) thay vì lưu ngay vào Firestore.
                // Lưu ý: Tuyệt đối KHÔNG kiểm tra tồn tại trong hàng chờ, chỉ ghi đè vào để tránh bug trùng tài khoản ảo.
                _cache.Set(uid, request.Username, TimeSpan.FromHours(24));

                // 3. Lấy link xác thực từ Firebase bằng FirebaseAdmin SDK (không tự động gửi email)
                string verificationLink = "";
                try
                {
                    verificationLink = await FirebaseAdmin.Auth.FirebaseAuth.DefaultInstance.GenerateEmailVerificationLinkAsync(request.Email);
                }
                catch (Exception ex)
                {
                    return BadRequest(new { message = "Đã tạo tài khoản nhưng không thể lấy link xác thực từ Firebase. Vui lòng thử lại sau.", error = ex.Message });
                }

                if (string.IsNullOrEmpty(verificationLink))
                {
                    return BadRequest(new { message = "Không thể lấy link xác thực từ Firebase. Vui lòng thử lại sau." });
                }

                // 4. Gửi email HTML tuỳ chỉnh qua SMTP Gmail với link Firebase
                string emailBody = $@"
                    <div style=""font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; padding: 40px 10px;"">
                        <div style=""max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #e0e0e0;"">
                            <div style=""background-color: #3e2723; padding: 25px; text-align: center;"">
                                <h1 style=""color: #e6a822; margin: 0; font-size: 28px; letter-spacing: 3px; font-weight: 900;"">UNDERCOVER</h1>
                                <p style=""color: #d3b88b; margin: 5px 0 0 0; font-style: italic; font-size: 14px;"">Ai là gián điệp?</p>
                            </div>
                            <div style=""padding: 30px 40px; color: #333333; line-height: 1.6;"">
                                <h2 style=""color: #2b1b18; margin-top: 0; font-size: 20px;"">Chào bạn,</h2>
                                <p style=""font-size: 16px;"">Cảm ơn bạn đã gia nhập cộng đồng <strong>Undercover</strong>!</p>
                                <p style=""font-size: 16px;"">Để đảm bảo tính bảo mật và giúp hệ thống nhận diện bạn là một người chơi, vui lòng nhấn vào nút bên dưới để xác thực địa chỉ email của mình:</p>
                                <div style=""text-align: center; margin: 40px 0;"">
                                    <a href='{verificationLink}' style=""display: inline-block; background-color: #9b111e; color: #ffffff; padding: 15px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(155, 17, 30, 0.3);"">XÁC THỰC TÀI KHOẢN NGAY</a>
                                </div>
                                <p style=""font-size: 13px; color: #888888; text-align: center; margin-bottom: 0; font-style: italic;"">
                                    (Vui lòng không chia sẻ đường dẫn này cho bất kỳ ai)
                                </p>
                            </div>
                            <div style=""background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;"">
                                <p style=""font-size: 12px; color: #aaaaaa; margin: 0;"">Nếu bạn không yêu cầu đăng ký tài khoản, vui lòng bỏ qua email này.</p>
                                <p style=""font-size: 12px; color: #aaaaaa; margin: 5px 0 0 0;"">© 2024 Undercover Game. All rights reserved.</p>
                            </div>
                        </div>
                    </div>
                ";

                // Đọc SMTP config từ appsettings.json
                var smtpHost = _config["SmtpSettings:Host"] ?? "smtp.gmail.com";
                var smtpPort = int.Parse(_config["SmtpSettings:Port"] ?? "587");
                var senderEmail = _config["SmtpSettings:SenderEmail"] ?? "undercovern8@gmail.com";
                var senderName = _config["SmtpSettings:SenderName"] ?? "Undercover Game";
                var appPassword = _config["SmtpSettings:AppPassword"] ?? "";

                using (var smtp = new SmtpClient(smtpHost, smtpPort))
                {
                    smtp.EnableSsl = true;
                    smtp.Credentials = new NetworkCredential(senderEmail, appPassword);

                    var mailMessage = new MailMessage
                    {
                        From = new MailAddress(senderEmail, senderName),
                        Subject = "Xác thực tài khoản Undercover",
                        Body = emailBody,
                        IsBodyHtml = true,
                    };
                    mailMessage.To.Add(request.Email);

                    await smtp.SendMailAsync(mailMessage);
                }

                return Ok(new { message = "Đăng ký thành công! Vui lòng kiểm tra hộp thư email (và hộp thư rác) của bạn để xác thực tài khoản." });
            }
            catch (Exception ex)
            {
                var msg = ex.Message ?? "";
                if (msg.Contains("EMAIL_EXISTS"))
                    return BadRequest(new { message = "Email này đã được đăng ký! Vui lòng sử dụng email khác hoặc đăng nhập." });
                if (msg.Contains("WEAK_PASSWORD"))
                    return BadRequest(new { message = "Mật khẩu quá yếu! Vui lòng dùng ít nhất 6 ký tự." });
                if (msg.Contains("INVALID_EMAIL"))
                    return BadRequest(new { message = "Định dạng Email không hợp lệ!" });
                if (msg.Contains("TOO_MANY_ATTEMPTS_TRY_LATER"))
                    return BadRequest(new { message = "Quá nhiều yêu cầu. Vui lòng thử lại sau vài phút!" });
                return BadRequest(new { message = "Có lỗi xảy ra khi tạo tài khoản.", error = ex.Message });
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
                
                // Kiểm tra xem email đã được xác thực qua Firebase chưa
                if (!result.User.Info.IsEmailVerified)
                {
                    return BadRequest(new { message = "Tài khoản chưa được xác thực! Vui lòng nhấn vào đường link trong email xác thực để kích hoạt tài khoản." });
                }

                string uid = result.User.Info.Uid;

                // Kiểm tra xem user đã có trong Firestore chưa (nếu đăng nhập lần đầu sau khi xác thực)
                DocumentReference docRef = _db.Collection("users").Document(uid);
                DocumentSnapshot snap = await docRef.GetSnapshotAsync();

                if (!snap.Exists)
                {
                    // Lấy username từ hàng chờ
                    string username = "Tân binh";
                    if (_cache.TryGetValue(uid, out string cachedUsername))
                    {
                        username = cachedUsername;
                        // XÓA SESSION TRONG HÀNG CHỜ
                        _cache.Remove(uid);
                    }

                    // Chính thức tạo user trong Firestore
                    await docRef.SetAsync(new
                    {
                        username = username,
                        totalGames = 0,
                        civilianWins = 0,
                        undercoverWins = 0,
                        mrWhiteWins = 0,
                        totalWins = 0,
                        mostPlayedRole = "Tân binh",
                        createdAt = Timestamp.GetCurrentTimestamp()
                    });
                }

                // Lấy token và trả về cả userId để frontend lưu localStorage
                string idToken = await result.User.GetIdTokenAsync();
                return Ok(new
                {
                    message = "Đăng nhập thành công!",
                    token = idToken,
                    userId = uid,   // frontend đọc data.userId
                    uid = uid        // giữ lại để backward compatible
                });
            }
            catch (Exception ex)
            {
                // Log full exception for easier debugging (includes stack trace and inner exceptions)
                _logger.LogError(ex, "Login failed for {Email}", request.Email);

                var msg = ex.Message ?? "";
                var isInvalidCredentials =
                    msg.Contains("INVALID_LOGIN_CREDENTIALS") ||
                    msg.Contains("INVALID_PASSWORD") ||
                    msg.Contains("WRONG_PASSWORD") ||
                    msg.Contains("EMAIL_NOT_FOUND") ||
                    msg.Contains("USER_NOT_FOUND");

                if (isInvalidCredentials)
                {
                    return BadRequest(new { message = "Sai Email ho\u1eb7c M\u1eadt kh\u1ea9u!" });
                }

                if (msg.Contains("TOO_MANY_ATTEMPTS_TRY_LATER") || msg.Contains("QUOTA_EXCEEDED"))
                    return BadRequest(new { message = "Tài khoản bị tạm khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau vài phút!" });
                if (msg.Contains("USER_DISABLED"))
                    return BadRequest(new { message = "Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ hỗ trợ!" });
                if (msg.Contains("NETWORK_REQUEST_FAILED"))
                    return StatusCode(503, new { message = "Không thể kết nối đến Firebase. Vui lòng thử lại!" });
                if (msg.Contains("invalid_grant", StringComparison.OrdinalIgnoreCase) ||
                    msg.Contains("Invalid JWT", StringComparison.OrdinalIgnoreCase))
                    return StatusCode(503, new { message = "Lỗi Firebase Admin credential hoặc giờ hệ thống. Hãy đồng bộ lại giờ máy và kiểm tra service account key." });
                return BadRequest(new { message = "Sai Email ho\u1eb7c M\u1eadt kh\u1ea9u!" });
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

        [HttpPost("google-sync")]
        public async Task<IActionResult> GoogleSync([FromBody] GoogleSyncRequest request)
        {
            if (string.IsNullOrEmpty(request.Uid) || string.IsNullOrEmpty(request.Username))
                return BadRequest(new { message = "Vui lòng cung cấp đủ Uid và Username!" });

            try
            {
                DocumentReference docRef = _db.Collection("users").Document(request.Uid);
                DocumentSnapshot snap = await docRef.GetSnapshotAsync();

                if (!snap.Exists)
                {
                    await docRef.SetAsync(new
                    {
                        username = request.Username,
                        totalGames = 0,
                        civilianWins = 0,
                        undercoverWins = 0,
                        mrWhiteWins = 0,
                        totalWins = 0,
                        mostPlayedRole = "Tân binh",
                        createdAt = Timestamp.GetCurrentTimestamp()
                    });
                    return Ok(new { message = "Khởi tạo hồ sơ thành công!" });
                }
                
                return Ok(new { message = "Hồ sơ đã tồn tại!" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Có lỗi xảy ra khi tạo hồ sơ.", error = ex.Message });
            }
        }
    }
}
