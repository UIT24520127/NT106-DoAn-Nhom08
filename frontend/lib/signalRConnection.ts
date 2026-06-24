import * as signalR from "@microsoft/signalr";

import { API_URL } from "./auth";

let connection: signalR.HubConnection | null = null;

export const getSignalRConnection = (token: string): signalR.HubConnection => {
  if (!connection) {
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/gamehub`, {
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
