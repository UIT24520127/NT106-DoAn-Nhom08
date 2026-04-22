namespace ServerUndercover.Models.State
{
    public class RoomPlayer
    {
        public string UserId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public bool IsReady { get; set; } = false;
        public string ConnectionId { get; set; } = string.Empty;
    }
}
