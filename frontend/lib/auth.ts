// lib/auth.ts

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"; // URL backend C# của bạn

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp;
    if (!exp) return false;
    return Date.now() >= exp * 1000;
  } catch (e) {
    return true;
  }
}

// Lưu token sau khi đăng nhập thành công(locastorage cuar trinh duyet)
export function saveToken(token: string) {
  sessionStorage.setItem("token", token);
}

// Lấy token (dùng khi cần gọi API cần xác thực)
export function getToken(): string | null {
  const token = sessionStorage.getItem("token");
  if (token && isTokenExpired(token)) {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userId");
    sessionStorage.removeItem("username");
    window.location.href = "/login";
    return null;
  }
  return token;
}

// Kiểm tra đã đăng nhập chưa (dùng để bảo vệ route)
export function isLoggedIn(): boolean {
  const token = sessionStorage.getItem("token");
  if (!token) return false;
  if (isTokenExpired(token)) {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userId");
    sessionStorage.removeItem("username");
    return false;
  }
  return true;
}

// Đăng xuất
export async function logout() {
  try {
    await fetch(`${API_URL}/api/logout`, { method: "POST" });
  } catch (error) {
    console.error("Lỗi logout:", error);
  } finally {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userId");
    sessionStorage.removeItem("username");
    window.location.href = "/login"; // Redirect về trang login
  }
}
