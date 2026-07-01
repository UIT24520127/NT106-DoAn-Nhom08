namespace ServerUndercover.Models.DTOs
{
    public class SendMessageDto
    {
        public string FriendshipId { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public string TargetUserId { get; set; } = string.Empty; // For updating unread count
        public string ClientMsgId { get; set; } = string.Empty; // ID tạo từ Frontend để mượt UI
    }
}
