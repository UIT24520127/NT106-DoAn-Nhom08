namespace ServerUndercover.Models.DTOs
{
    public class RespondFriendRequestDto
    {
        public string FriendshipId { get; set; } = string.Empty;
        public bool Accept { get; set; }
    }
}
