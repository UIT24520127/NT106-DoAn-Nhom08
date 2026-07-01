"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { saveToken } from "@/lib/auth";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useGameSound } from "@/hooks/useGameSound";
import { signIn as tauriGoogleSignIn } from '@choochmeque/tauri-plugin-google-auth-api';


export default function LoginPage() {
  const router = useRouter();
  const { playClick, playAlert } = useGameSound();

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      router.push("/menu");
    }
  }, [router]);

  // Đã bỏ useEffect chứa getRedirectResult vì dùng Tauri plugin cho Desktop và Popup cho Web.

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ================= STATE CHO HỘP THOẠI GOOGLE NAME =================
  const [googleNamePrompt, setGoogleNamePrompt] = useState({
    isOpen: false,
    uid: "",
    defaultName: "",
    idToken: ""
  });
  const [googleNewName, setGoogleNewName] = useState("");

  // ================= STATE CHO HỘP THOẠI (POPUP) =================
  const [popup, setPopup] = useState({
    isOpen: false,
    title: "",
    message: "",
    isSuccess: true,
    redirectOnClose: false // Dùng để chuyển trang sau khi tắt popup thành công
  });

  const showPopup = (title: string, message: string, isSuccess: boolean = true, redirectOnClose: boolean = false) => {
    if (!isSuccess) playAlert();
    setPopup({ isOpen: true, title, message, isSuccess, redirectOnClose });
  };

  const closePopup = () => {
    setPopup((prev) => ({ ...prev, isOpen: false }));
    if (popup.redirectOnClose) {
      router.push('/menu');
    }
  };
  // ===============================================================

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://doanuit.online"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        saveToken(data.token);
        sessionStorage.setItem("token", data.token);
        // fix: backend trả 'userId' và 'uid' — đọc cả hai để chắc chắn
        const nameToSave = data.username || data.email || "Người chơi";
        sessionStorage.setItem("username", nameToSave);
        const idToSave = data.userId || data.uid || data.Id;
        if (idToSave) {
          sessionStorage.setItem("userId", idToSave);
          console.log("Đã lưu userId:", idToSave);
        } else {
          console.warn("Cảnh báo: Backend không trả về userId!");
        }
        showPopup("Thành công!", data.message, true, true);
      } else {
        showPopup("Thất bại", data.message, false);
      }
    } catch (err) {
      showPopup("Lỗi kết nối", "Không thể kết nối đến Server C#.", false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    playClick();
    if (isGoogleLoggingIn) return;
    setIsGoogleLoggingIn(true);
    try {
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      let idToken = "";
      let userUid = "";
      let displayName = "";

      if (isTauri) {
        // Chạy trên Desktop Tauri -> dùng Plugin Native
        console.log("Sử dụng Tauri Google Auth Plugin...");

        // Timeout 60 giây (1 phút) để tránh bị kẹt nút "Đang kết nối..." mãi mãi nếu user tắt trình duyệt
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout_Browser_Closed")), 60000);
        });

        const successHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Đăng nhập thành công</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap');
    body {
      margin: 0; padding: 0; background-color: #111317; display: flex; justify-content: center;
      align-items: center; min-height: 100vh; font-family: 'Space Grotesk', sans-serif;
    }
    .card {
      background: #1a1c23; border: 4px solid #3e2723; border-radius: 16px; padding: 40px;
      text-align: center; box-shadow: 8px 8px 0px #3e2723; max-width: 400px; width: 90%;
      animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.8) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    .icon {
      width: 70px; height: 70px; background: #10b981; border-radius: 50%; display: flex;
      justify-content: center; align-items: center; margin: 0 auto 20px;
      border: 4px solid #065f46; box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }
    .icon svg { width: 35px; height: 35px; color: #fff; }
    h1 { margin: 0 0 10px 0; font-size: 24px; color: #f3f4f6; text-transform: uppercase; }
    p { margin: 0; font-size: 15px; color: #9ca3af; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>THÀNH CÔNG!</h1>
    <p>Xác thực hoàn tất. Trình duyệt sẽ tự động đóng sau vài giây...</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>
`;

        const pluginPromise = tauriGoogleSignIn({
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || '', // Required for desktop
          scopes: ['openid', 'email', 'profile'],
          successHtmlResponse: successHtml
        });

        const response: any = await Promise.race([pluginPromise, timeoutPromise]);

        if (!response.idToken) {
          throw new Error("Không nhận được idToken từ Google");
        }

        const credential = GoogleAuthProvider.credential(response.idToken);
        const result = await signInWithCredential(auth, credential);
        idToken = await result.user.getIdToken();
        userUid = result.user.uid;
        displayName = result.user.displayName || "Google User";
      } else {
        // Chạy trên Web Browser -> dùng Firebase Popup bình thường
        console.log("Sử dụng Firebase Popup cho Web...");
        const result = await signInWithPopup(auth, googleProvider);
        idToken = await result.user.getIdToken();
        userUid = result.user.uid;
        displayName = result.user.displayName || "Google User";
      }

      // Xử lý logic đăng nhập với Backend sau khi có Token
      const checkRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://doanuit.online"}/api/user/profile/${userUid}`);
      if (checkRes.ok) {
        saveToken(idToken);
        sessionStorage.setItem("userId", userUid);
        console.log("Đã đăng nhập Google, userId:", userUid);
        showPopup("Thành công!", "Đăng nhập bằng Google thành công!", true, true);
      } else if (checkRes.status === 404) {
        setGoogleNamePrompt({
          isOpen: true,
          uid: userUid,
          defaultName: displayName,
          idToken: idToken
        });
        setGoogleNewName(displayName);
      } else {
        showPopup("Lỗi kết nối", "Không thể kiểm tra thông tin tài khoản.", false);
      }
    } catch (err: any) {
      console.error("Google login error:", err);
      const errMsg = err.message || err.toString();
      if (errMsg.includes("Timeout_Browser_Closed")) {
        showPopup("Đã hủy bỏ", "Bạn đã đóng trình duyệt hoặc quá thời gian đăng nhập. Vui lòng thử lại.", false);
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        showPopup("Thất bại", "Lỗi Google: " + errMsg, false);
      }
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  const handleGoogleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleNewName.trim()) {
      showPopup("Lỗi", "Vui lòng nhập tên hiển thị mới!", false);
      return;
    }

    try {
      const syncRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://doanuit.online"}/api/auth/google-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: googleNamePrompt.uid, username: googleNewName.trim() }),
      });

      const data = await syncRes.json();

      if (syncRes.status === 409) {
        showPopup("Lỗi", data.message, false);
      } else if (syncRes.ok) {
        if (googleNamePrompt.idToken) {
          saveToken(googleNamePrompt.idToken);
        }
        sessionStorage.setItem("userId", googleNamePrompt.uid);
        sessionStorage.setItem("username", googleNewName.trim());
        setGoogleNamePrompt({ isOpen: false, uid: "", defaultName: "", idToken: "" });
        showPopup("Thành công!", "Đăng nhập bằng Google thành công!", true, true);
      } else {
        showPopup("Lỗi", data.message, false);
      }
    } catch (err) {
      showPopup("Lỗi kết nối", "Không thể kết nối đến Server C#.", false);
    }
  };


  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://doanuit.online"}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        showPopup("Đã Gửi Email Xác Thực!", data.message, true);
        setIsRegistering(false);
        setPassword("");
      } else {
        showPopup("Đăng ký thất bại", data.message, false);
      }
    } catch (err) {
      showPopup("Lỗi kết nối", "Không thể kết nối đến Server C#.", false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showPopup("Thiếu thông tin", "Vui lòng nhập Email thật của bạn vào ô Email phía trên trước khi bấm Quên mật mã!", false);
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://doanuit.online"}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        showPopup("Đã gửi yêu cầu", data.message, true);
      } else {
        showPopup("Lỗi", data.message, false);
      }
    } catch (err) {
      showPopup("Lỗi kết nối", "Không thể kết nối đến Server C#.", false);
    }
  };


  return (
    // ĐÃ SỬA: Dùng h-screen w-screen và overflow-hidden để form luôn nằm chính giữa, không xê dịch
    <div
      className="relative h-screen w-screen flex items-center justify-center bg-gray-900 overflow-hidden"
      style={{
        backgroundImage: "url('/bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      }}
    >

      {/* Khung Form màu giấy - Đã thêm w-[90%] max-w-[400px] để scale đẹp trên mọi màn hình */}
      <div className="relative z-10 bg-[#fcf8e8] w-[90%] max-w-[400px] rounded-2xl p-8 shadow-2xl border-2 border-[#d3b88b]">

        {!isRegistering ? (
          /* ================= MÀN HÌNH ĐĂNG NHẬP ================= */
          <div className="flex flex-col animate-fade-in">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold text-[#3e2723] uppercase tracking-wider">UNDERCOVER</h1>
              <p className="text-[#6d4c41] italic text-sm mt-1 font-semibold">Ai là gián điệp ?</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div>
                <label className="text-base font-bold text-[#2b1b18] mb-1 block">Email Đăng Nhập</label>
                <input
                  type="email"
                  placeholder="Nhập email của bạn..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#e0d6c8] rounded focus:outline-none focus:border-[#9b111e] text-gray-900 font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-base font-bold text-[#2b1b18] mb-1 block">Mật Khẩu</label>
                <input
                  type="password"
                  placeholder="Nhập mật khẩu..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#e0d6c8] rounded focus:outline-none focus:border-[#9b111e] text-gray-900 font-medium"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                onClick={() => playClick()}
                className={`w-full font-bold py-3 rounded shadow-lg mt-2 transition-transform duration-150 active:scale-95
                  ${isLoggingIn
                    ? 'bg-gray-500 cursor-not-allowed text-white'
                    : 'bg-[#9b111e] hover:bg-[#7a0000] text-white'
                  }`}
              >
                {isLoggingIn ? 'ĐANG KẾT NỐI...' : 'VÀO TRÒ CHƠI'}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-[#e0d6c8]"></div>
                <span className="flex-shrink-0 mx-4 text-[#6d4c41] text-sm font-bold">HOẶC</span>
                <div className="flex-grow border-t border-[#e0d6c8]"></div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoggingIn}
                className={`w-full ${isGoogleLoggingIn ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#9b111e] hover:bg-[#7a0000] active:scale-95'} text-white font-bold py-3 rounded shadow-lg transition-transform duration-150 flex items-center justify-center gap-3`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
                </svg>
                {isGoogleLoggingIn ? "ĐANG KẾT NỐI..." : "ĐĂNG NHẬP BẰNG GOOGLE"}
              </button>
            </form>

            <div className="text-center mt-5 mb-5">
              <span
                onClick={handleForgotPassword}
                className="text-[#9b111e] text-sm font-bold cursor-pointer hover:underline"
              >
                Quên mật mã ?
              </span>
            </div>

            <hr className="border-[#e0d6c8] mb-5 border-t-2" />

            <button
              onClick={() => { playClick(); setIsRegistering(true); setPassword(""); }}
              className="w-full bg-[#3e2723] hover:bg-[#2b1b18] text-white font-bold py-3 rounded shadow-lg transition-transform duration-150 active:scale-95"
            >
              TẠO HỒ SƠ MỚI
            </button>
          </div>
        ) : (
          /* ================= MÀN HÌNH ĐĂNG KÝ ================= */
          <div className="flex flex-col animate-fade-in">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-extrabold text-[#3e2723] uppercase tracking-wider">ĐĂNG KÝ HỒ SƠ</h1>
            </div>

            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div>
                <label className="text-base font-bold text-[#2b1b18] mb-1 block">Email Thật (Dùng để khôi phục MK)</label>
                <input
                  type="email"
                  placeholder="VD: luandoan@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#e0d6c8] rounded focus:outline-none focus:border-[#9b111e] text-gray-900 font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-base font-bold text-[#2b1b18] mb-1 block">Tên Trong Game (Nickname)</label>
                <input
                  type="text"
                  placeholder="VD: Thám tử lừng danh..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#e0d6c8] rounded focus:outline-none focus:border-[#9b111e] text-gray-900 font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-base font-bold text-[#2b1b18] mb-1 block">Mật Khẩu</label>
                <input
                  type="password"
                  placeholder="Mật khẩu ít nhất 6 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#e0d6c8] rounded focus:outline-none focus:border-[#9b111e] text-gray-900 font-medium"
                  required
                />
              </div>

              <button
                type="submit"
                onClick={() => playClick()}
                className="w-full bg-[#9b111e] hover:bg-[#7a0000] text-white font-bold py-3 rounded shadow-lg mt-3 transition-transform duration-150 active:scale-95"
              >
                XÁC NHẬN TẠO
              </button>
            </form>

            <div className="text-center mt-5">
              <span
                onClick={() => { playClick(); setIsRegistering(false); }}
                className="text-[#3e2723] text-sm font-bold cursor-pointer hover:underline"
              >
                ← Trở lại đăng nhập
              </span>
            </div>
          </div>
        )}
      </div>



      {/* ================= COMPONENT HỘP THOẠI (POPUP) THÔNG BÁO ================= */}
      {popup.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#fcf8e8] w-full max-w-sm border-4 border-[#3e2723] rounded p-6 text-center shadow-[8px_8px_0_#3e2723] animate-scale-in relative overflow-hidden">

            {/* Background pattern */}
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3e2723 2px, transparent 2px)', backgroundSize: '16px 16px' }}></div>

            {/* Icon trạng thái */}
            <div className={`mx-auto w-16 h-16 rounded-full border-4 flex items-center justify-center mb-4 ${popup.isSuccess ? "bg-green-100 border-green-600 text-green-600" : "bg-red-100 border-[#9b111e] text-[#9b111e]"
              }`}>
              {popup.isSuccess ? (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </div>

            {/* Tiêu đề & Lời nhắn */}
            <h2 className={`text-2xl font-black tracking-wide mb-2 uppercase ${popup.isSuccess ? "text-green-700" : "text-[#9b111e]"}`}>
              {popup.title}
            </h2>
            <div className="w-12 h-1 bg-[#3e2723]/20 mx-auto mb-4 rounded-full"></div>
            <p className="text-[#3e2723] font-bold text-base mb-6 leading-relaxed relative z-10">
              {popup.message}
            </p>

            {/* Nút đóng */}
            <button
              onClick={() => { playClick(); closePopup(); }}
              className="w-full bg-[#3e2723] hover:bg-[#2b1b18] text-[#fcf8e8] border-2 border-[#3e2723] font-black tracking-widest py-3 rounded shadow-[0_4px_0_#1a0f0d] transition-all duration-150 active:translate-y-1 active:shadow-none uppercase"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* ================= GOOGLE NAME PROMPT POPUP ================= */}
      {/* ================= GOOGLE NAME PROMPT POPUP ================= */}
      {googleNamePrompt.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#fcf8e8] w-full max-w-sm border-4 border-[#3e2723] rounded p-6 shadow-[8px_8px_0_#3e2723] animate-scale-in relative overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3e2723 2px, transparent 2px)', backgroundSize: '16px 16px' }}></div>

            <div className="relative z-10">
              <h2 className="text-2xl font-black text-[#3e2723] text-center mb-2 uppercase tracking-wide">Tân Binh Mới</h2>
              <div className="w-12 h-1 bg-[#3e2723]/20 mx-auto mb-4 rounded-full"></div>

              <p className="text-sm text-[#6d4c41] font-bold text-center mb-5 leading-relaxed">
                Chào mừng bạn! Hãy chọn một <span className="text-[#9b111e]">tên hiển thị</span> ấn tượng để tham gia ván chơi.
              </p>

              <form onSubmit={handleGoogleNameSubmit} className="flex flex-col gap-4">
                <input
                  type="text"
                  placeholder="Tên của bạn..."
                  value={googleNewName}
                  onChange={(e) => setGoogleNewName(e.target.value)}
                  className="w-full px-4 py-3 bg-white border-2 border-[#3e2723] rounded focus:outline-none focus:border-[#9b111e] text-[#3e2723] font-black text-center shadow-inner"
                  required
                />
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => { playClick(); setGoogleNamePrompt({ isOpen: false, uid: "", defaultName: "", idToken: "" }); }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-[#3e2723] border-2 border-[#3e2723] font-black py-2.5 rounded shadow-[0_4px_0_#3e2723] transition-all active:translate-y-1 active:shadow-none uppercase text-sm"
                  >
                    HỦY
                  </button>
                  <button
                    type="submit"
                    onClick={() => playClick()}
                    className="flex-[2] bg-[#9b111e] hover:bg-[#7a0000] text-[#fcf8e8] border-2 border-[#3e2723] font-black py-2.5 rounded shadow-[0_4px_0_#1a0f0d] transition-all active:translate-y-1 active:shadow-none uppercase text-sm"
                  >
                    XÁC NHẬN
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
