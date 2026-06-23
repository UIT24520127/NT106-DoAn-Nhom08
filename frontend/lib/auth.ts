// lib/auth.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"; // URL backend C# của bạn

// Lưu token sau khi đăng nhập thành công(locastorage cuar trinh duyet)
export function saveToken(token: string) {
  sessionStorage.setItem("token", token);
}

// Lấy token (dùng khi cần gọi API cần xác thực)
export function getToken(): string | null {
  return sessionStorage.getItem("token");
}

// Kiểm tra đã đăng nhập chưa (dùng để bảo vệ route)
export function isLoggedIn(): boolean {
  return !!sessionStorage.getItem("token");
}

// Đăng xuất
export async function logout() {
  try {
    await fetch(`${API_URL}/api/logout`, { method: "POST" });
  } catch (error) {
    console.error("Lỗi logout:", error);
  } finally {
    sessionStorage.removeItem("token");
    window.location.href = "/login"; // Redirect về trang login
  }
}
