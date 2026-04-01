// lib/auth.ts

const API_URL = "http://localhost:5000"; // URL backend C# của bạn

// Lưu token sau khi đăng nhập thành công
export function saveToken(token: string) {
  localStorage.setItem("token", token);
}

// Lấy token (dùng khi cần gọi API cần xác thực)
export function getToken(): string | null {
  return localStorage.getItem("token");
}

// Kiểm tra đã đăng nhập chưa (dùng để bảo vệ route)
export function isLoggedIn(): boolean {
  return !!localStorage.getItem("token");
}

// Đăng xuất
export async function logout() {
  try {
    await fetch(`${API_URL}/api/logout`, { method: "POST" });
  } catch (error) {
    console.error("Lỗi logout:", error);
  } finally {
    localStorage.removeItem("token");
    window.location.href = "/login"; // Redirect về trang login
  }
}