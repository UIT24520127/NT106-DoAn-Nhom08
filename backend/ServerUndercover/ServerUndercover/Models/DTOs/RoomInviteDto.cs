namespace ServerUndercover.Models.DTOs
{
    public class RoomInviteDto
    {
        public string TargetUserId { get; set; } = string.Empty;
        public string RoomId { get; set; } = string.Empty;
        public string InviterName { get; set; } = string.Empty; // Optional, can be provided by client if backend doesn't have it easily
    }
}
