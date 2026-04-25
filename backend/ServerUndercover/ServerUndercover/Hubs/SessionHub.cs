using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using System;

namespace ServerUndercover.Hubs
{
    public class SessionHub : Hub
    {
        // Thread-safe dictionary to maintain the mapping of userId -> connectionId
        private static readonly ConcurrentDictionary<string, string> _userConnections = new ConcurrentDictionary<string, string>();

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
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            // Optional: Remove the connection from the dictionary on disconnect.
            // This is actually tricky because if they just refreshed the page, 
            // a new connection might have already overwritten the dictionary for this user,
            // and we don't want the disconnect of the OLD connection to remove the NEW connection id.
            // So we only remove if the connection id matches.

            string currentConnectionId = Context.ConnectionId;
            foreach (var kvp in _userConnections)
            {
                if (kvp.Value == currentConnectionId)
                {
                    _userConnections.TryRemove(kvp.Key, out _);
                    break;
                }
            }

            return base.OnDisconnectedAsync(exception);
        }
    }
}
