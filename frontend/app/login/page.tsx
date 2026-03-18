"use client";
import { useState } from "react";

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false); 
  
  const [email, setEmail] = useState(""); 
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("https://localhost:7226/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }), 
      });
      const data = await res.json();
      if (res.ok) alert("✅ " + data.message);
      else alert("❌ Lỗi: " + data.message);
    } catch (err) {
      alert("Không thể kết nối đến Server C#.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("https://localhost:7226/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("✅ " + data.message);
        setIsRegistering(false); 
        setPassword(""); 
      } else alert("❌ Lỗi: " + data.message);
    } catch (err) {
      alert("Không thể kết nối đến Server C#.");
    }
  };

  const handleForgotPassword = () => {
    if (!email) {
      alert("Vui lòng nhập Email thật của bạn vào ô Email phía trên trước khi bấm Quên mật mã!");
      return;
    }
    alert(`Đã gửi yêu cầu khôi phục mật khẩu đến email: ${email}. Vui lòng kiểm tra hòm thư!`);
  };

  return (
    /* Đã tối ưu lại phần load ảnh nền trực tiếp vào thẻ div để ưu tiên cao nhất */
    <div 
      className="min-h-screen flex items-center justify-center bg-gray-900"
      style={{ 
        backgroundImage: "url('/bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
      }}
    >
      
      {/* Khung Form màu giấy */}
      <div className="bg-[#fcf8e8] w-full max-w-sm rounded-2xl p-8 shadow-2xl border-2 border-[#d3b88b]">
        
        {!isRegistering ? (
          /* ================= MÀN HÌNH ĐĂNG NHẬP ================= */
          <div className="flex flex-col animate-fade-in">
            <div className="text-center mb-6">
              {/* Đã bỏ font-serif để tránh lỗi tiếng Việt */}
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
              {/* Đã bỏ font-serif và gõ lại chữ ĐĂNG KÝ HỒ SƠ */}
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
    </div>
  );
}