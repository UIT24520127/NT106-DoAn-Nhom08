"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { saveToken } from "@/lib/auth";



export default function LoginPage() {
  const router = useRouter(); 

  const [isRegistering, setIsRegistering] = useState(false); 
  
  const [email, setEmail] = useState(""); 
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ================= STATE CHO HỘP THOẠI (POPUP) =================
  const [popup, setPopup] = useState({
    isOpen: false,
    title: "",
    message: "",
    isSuccess: true,
    redirectOnClose: false // Dùng để chuyển trang sau khi tắt popup thành công
  });

  const showPopup = (title: string, message: string, isSuccess: boolean = true, redirectOnClose: boolean = false) => {
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
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }), 
      });
      const data = await res.json();
      
      if (res.ok) {
            saveToken(data.token); 
            showPopup("Thành công!", data.message, true, true);
          }
      else {
        showPopup("Thất bại", data.message, false);
      }
    } catch (err) {
      showPopup("Lỗi kết nối", "Không thể kết nối đến Server C#.", false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();
      
      if (res.ok) {
        showPopup("Tạo hồ sơ thành công!", data.message, true);
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5120"}/api/auth/forgot-password`, {
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
        backgroundImage: "url('/bg.png')",
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
                className="w-full bg-[#9b111e] hover:bg-[#7a0000] text-white font-bold py-3 rounded shadow-lg mt-2 transition-transform duration-150 active:scale-95"
              >
                VÀO TRÒ CHƠI
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
              onClick={() => { setIsRegistering(true); setPassword(""); }}
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
                className="w-full bg-[#9b111e] hover:bg-[#7a0000] text-white font-bold py-3 rounded shadow-lg mt-3 transition-transform duration-150 active:scale-95"
              >
                XÁC NHẬN TẠO
              </button>
            </form>

            <div className="text-center mt-5">
              <span 
                onClick={() => setIsRegistering(false)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#fcf8e8] w-full max-w-sm rounded-xl shadow-2xl border-2 border-[#d3b88b] p-6 text-center animate-fade-in">
            {/* Icon trạng thái */}
            <div className="text-5xl mb-3 flex justify-center">
              {popup.isSuccess ? "✅" : "❌"}
            </div>
            
            {/* Tiêu đề & Lời nhắn */}
            <h2 className={`text-2xl font-black mb-2 ${popup.isSuccess ? "text-green-700" : "text-red-700"}`}>
              {popup.title}
            </h2>
            <p className="text-[#3e2723] font-medium text-base mb-6">
              {popup.message}
            </p>
            
            {/* Nút đóng */}
            <button 
              onClick={closePopup}
              className="w-full bg-[#3e2723] hover:bg-[#2b1b18] text-white font-bold py-2.5 rounded shadow transition-transform duration-150 active:scale-95"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

    </div>
  );
}