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

    public enum GamePhase
    {
        Describing,
        Voting,
        WhiteHatGuess,
        GameEnd
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

        // ============================================================
        // GAME LOOP STATE
        // ============================================================

        /// <summary>Phase hiện tại của game (Describing / Voting / WhiteHatGuess / GameEnd)</summary>
        public GamePhase Phase { get; set; } = GamePhase.Describing;

        /// <summary>Thứ tự lượt miêu tả (danh sách UserId của người còn sống, shuffle mỗi vòng)</summary>
        public List<string> TurnOrder { get; set; } = new();

        /// <summary>Index vào TurnOrder cho người đang đến lượt miêu tả</summary>
        public int CurrentTurnIndex { get; set; } = 0;

        /// <summary>Thời điểm kết thúc voting (Unix ms, để client sync countdown)</summary>
        public long VoteEndTime { get; set; } = 0;

        /// <summary>Key: voterId, Value: targetUserId — phiếu trong vòng vote hiện tại</summary>
        public ConcurrentDictionary<string, string> Votes { get; set; } = new();

        /// <summary>Số vòng đã chơi (tăng mỗi lần sau vote)</summary>
        public int RoundNumber { get; set; } = 0;
    }
}
