using System.Collections.Concurrent;

namespace ServerUndercover.Models.State
{
    public class GameSettings
    {
        public int MaxPlayers { get; set; } = 6;
        public int MaxBlackHats { get; set; } = 1;
        public int MaxWhiteHats { get; set; } = 1;
    }

    public enum RoomState
    {
        Waiting,
        Playing,
        Finished
    }

    public class Room
    {
        public string RoomId { get; set; } = string.Empty;
        public string HostId { get; set; } = string.Empty;
        public bool IsPublic { get; set; } = true;
        public RoomState State { get; set; } = RoomState.Waiting;
        public GameSettings Settings { get; set; } = new GameSettings();
        
        // Key: UserId, Value: RoomPlayer
        public ConcurrentDictionary<string, RoomPlayer> Players { get; set; } = new();

        // Key: UserId, Value: Ban Expiration UTC Time
        public ConcurrentDictionary<string, DateTime> BannedUsers { get; set; } = new();

        public int CurrentPlayerCount => Players.Count;
    }
}
