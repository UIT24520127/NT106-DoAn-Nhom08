using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks; // Cần thêm cái này để dùng Task
using ServerUndercover.Services;

namespace ServerUndercover.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly IUserService _userService;

        // 1. Inject Interface vào đây
        public UserController(IUserService userService)
        {
            _userService = userService;
        }

        // 2. Chuyển hàm này thành async Task<IActionResult>
        [HttpGet("profile/{userId}")]
        public async Task<IActionResult> GetProfile(string userId)
        {
            // 3. Gọi hàm từ Service với từ khóa await
            var profile = await _userService.GetUserProfile(userId);

            if (profile == null)
            {
                return NotFound(new { message = "Không tìm thấy người dùng trên Firestore!" });
            }

            return Ok(profile);
        }
    }
}