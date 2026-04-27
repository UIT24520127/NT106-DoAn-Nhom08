import * as signalR from "@microsoft/signalr";

let connection: signalR.HubConnection | null = null;

export const getSignalRConnection = (token: string): signalR.HubConnection => {
  if (!connection) {
    connection = new signalR.HubConnectionBuilder()
      .withUrl("https://localhost:7210/gamehub", {
        accessTokenFactory: () => token,
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None) // Tắt log mặc định để tránh màn hình đỏ Next.js
      .build();
  }
  return connection;
};

// Hàm tiện ích để lấy lại kết nối hiện tại (nếu có)
export const getCurrentConnection = (): signalR.HubConnection | null => {
  return connection;
};
