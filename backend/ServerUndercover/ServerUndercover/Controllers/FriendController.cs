using Microsoft.AspNetCore.Mvc;
using ServerUndercover.Models.DTOs;
using ServerUndercover.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using ServerUndercover.Hubs;
using System.Security.Claims;

namespace ServerUndercover.Controllers
{
    [ApiController]
    [Route("api/friends")]
    [Authorize]
    public class FriendController : ControllerBase
    {
        private readonly FriendService _friendService;
        private readonly IHubContext<SessionHub> _hubContext;

        public FriendController(FriendService friendService, IHubContext<SessionHub> hubContext)
        {
            _friendService = friendService;
            _hubContext = hubContext;
        }

        private string GetUserId()
        {
            return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("user_id")?.Value ?? "";
        }

        [HttpGet]
        public async Task<IActionResult> GetFriends()
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var friends = await _friendService.GetFriendsAsync(userId);
            return Ok(friends);
        }

        [HttpGet("requests/pending")]
        public async Task<IActionResult> GetPendingRequests()
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var requests = await _friendService.GetPendingRequestsAsync(userId);
            return Ok(requests);
        }

        [HttpGet("search")]
        public async Task<IActionResult> SearchUsers([FromQuery] string q)
        {
            if (string.IsNullOrEmpty(q)) return BadRequest(new { message = "Vui lòng nhập từ khóa tìm kiếm" });

            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var users = await _friendService.SearchUsersAsync(q, userId);
            return Ok(users);
        }

        [HttpPost("request")]
        public async Task<IActionResult> SendFriendRequest([FromBody] SendFriendRequestDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            if (string.IsNullOrEmpty(request.TargetUserId))
                return BadRequest(new { message = "Vui lòng cung cấp TargetUserId" });

            string error = await _friendService.SendFriendRequestAsync(userId, request.TargetUserId);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            string connectionId = SessionHub.GetConnectionId(request.TargetUserId);
            if (!string.IsNullOrEmpty(connectionId))
            {
                await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveFriendRequest", new { requesterId = userId });
            }

            return Ok(new { message = "Đã gửi lời mời kết bạn" });
        }

        [HttpPost("accept")]
        public async Task<IActionResult> AcceptFriendRequest([FromBody] RespondFriendRequestDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            string error = await _friendService.RespondFriendRequestAsync(userId, request.FriendshipId, true);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            return Ok(new { message = "Đã chấp nhận lời mời kết bạn" });
        }

        [HttpPost("decline")]
        public async Task<IActionResult> DeclineFriendRequest([FromBody] RespondFriendRequestDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            string error = await _friendService.RespondFriendRequestAsync(userId, request.FriendshipId, false);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            return Ok(new { message = "Đã từ chối lời mời kết bạn" });
        }

        [HttpPost("block")]
        public async Task<IActionResult> BlockUser([FromBody] SendFriendRequestDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            string error = await _friendService.BlockUserAsync(userId, request.TargetUserId);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            return Ok(new { message = "Đã chặn người dùng" });
        }

        [HttpPost("invite-room")]
        public async Task<IActionResult> InviteToRoom([FromBody] RoomInviteDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            if (string.IsNullOrEmpty(request.TargetUserId) || string.IsNullOrEmpty(request.RoomId))
                return BadRequest(new { message = "Vui lòng cung cấp TargetUserId và RoomId" });

            string connectionId = SessionHub.GetConnectionId(request.TargetUserId);
            if (!string.IsNullOrEmpty(connectionId))
            {
                await _hubContext.Clients.Client(connectionId).SendAsync("ReceiveRoomInvite", new { roomId = request.RoomId, inviterName = request.InviterName });
                return Ok(new { message = "Đã gửi lời mời vào phòng" });
            }
            
            return BadRequest(new { message = "Người dùng này hiện không online hoặc không ở sảnh." });
        }

        [HttpDelete("{targetUserId}")]
        public async Task<IActionResult> Unfriend(string targetUserId)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            string error = await _friendService.UnfriendAsync(userId, targetUserId);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            return Ok(new { message = "Đã hủy kết bạn" });
        }

        [HttpGet("message/{friendshipId}")]
        public async Task<IActionResult> GetMessages(string friendshipId, [FromQuery] long? beforeTimestamp)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var messages = await _friendService.GetMessagesAsync(friendshipId, beforeTimestamp);
            return Ok(messages);
        }

        [HttpPost("message")]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageDto request)
        {
            string userId = GetUserId();
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            if (string.IsNullOrEmpty(request.FriendshipId) || string.IsNullOrEmpty(request.Text))
                return BadRequest(new { message = "Vui lòng cung cấp FriendshipId và Text" });

            string error = await _friendService.SendMessageAsync(userId, request);
            if (!string.IsNullOrEmpty(error))
                return BadRequest(new { message = error });

            return Ok(new { message = "Đã gửi tin nhắn" });
        }
    }
}
