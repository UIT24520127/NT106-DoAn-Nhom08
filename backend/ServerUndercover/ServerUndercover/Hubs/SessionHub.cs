using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using System;
using Firebase.Database;
using Firebase.Database.Query;

namespace ServerUndercover.Hubs
{
    public class SessionHub : Hub
    {
        // Thread-safe dictionary to maintain the mapping of userId -> connectionId
        private static readonly ConcurrentDictionary<string, string> _userConnections = new ConcurrentDictionary<string, string>();
        private readonly FirebaseClient _firebaseClient;

        public SessionHub(FirebaseClient firebaseClient)
        {
            _firebaseClient = firebaseClient;
        }

        public static string? GetConnectionId(string userId)
        {
            if (string.IsNullOrEmpty(userId)) return null;
            _userConnections.TryGetValue(userId, out string existingConnectionId);
            return existingConnectionId;
        }

        public async Task RegisterSession(string userId)
        {
            if (string.IsNullOrEmpty(userId)) return;

            string currentConnectionId = Context.ConnectionId;

            // Check if the user already has an active session on a different connection
            if (_userConnections.TryGetValue(userId, out string existingConnectionId))
            {
                if (existingConnectionId != currentConnectionId)
                {
                    // Trigger force logout on the existing (old) connection
                    await Clients.Client(existingConnectionId).SendAsync("ForceLogout");
                }
            }

            // Register or update the user's connection
            _userConnections.AddOrUpdate(userId, currentConnectionId, (key, oldValue) => currentConnectionId);

            try
            {
                // Update Presence (Online)
                await _firebaseClient.Child("presence").Child(userId).PutAsync(new
                {
                    status = "Online",
                    lastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SessionHub] Error updating presence for {userId}: {ex.Message}");
            }

            // Broadcast status to everyone (frontend will filter by friend list)
            await Clients.All.SendAsync("FriendStatusChanged", userId, "Online");
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            string currentConnectionId = Context.ConnectionId;
            string disconnectedUserId = null;

            foreach (var kvp in _userConnections)
            {
                if (kvp.Value == currentConnectionId)
                {
                    disconnectedUserId = kvp.Key;
                    _userConnections.TryRemove(kvp.Key, out _);
                    break;
                }
            }

            if (!string.IsNullOrEmpty(disconnectedUserId))
            {
                try
                {
                    // Update Presence (Offline)
                    await _firebaseClient.Child("presence").Child(disconnectedUserId).PutAsync(new
                    {
                        status = "Offline",
                        lastSeen = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SessionHub] Error updating offline presence for {disconnectedUserId}: {ex.Message}");
                }

                await Clients.All.SendAsync("FriendStatusChanged", disconnectedUserId, "Offline");
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task InviteFriendToRoom(string friendId, string roomId, string inviterName)
        {
            string connectionId = GetConnectionId(friendId);
            if (!string.IsNullOrEmpty(connectionId))
            {
                await Clients.Client(connectionId).SendAsync("ReceiveRoomInvite", new { roomId, inviterName });
            }
        }
    }
}
