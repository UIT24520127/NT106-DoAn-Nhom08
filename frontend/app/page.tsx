"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { API_URL, getToken } from "@/lib/auth";

export default function LoadingScreen() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      const token = getToken();
      const userId = sessionStorage.getItem("userId");

      if (!token || !userId) {
        if (isMounted) router.push("/login");
        return;
      }

      try {
        // Gọi API để đánh thức backend và xác thực user
        const res = await fetch(`${API_URL}/api/User/profile/${userId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          }
        });

        if (res.ok) {
          if (isMounted) router.push("/menu");
        } else {
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("userId");
          sessionStorage.removeItem("username");
          if (isMounted) router.push("/login");
        }
      } catch (err) {
        // Nếu lỗi mạng, vẫn chuyển vào menu để SessionGuard xử lý tiếp
        console.warn("Lỗi kết nối tới server:", err);
        if (isMounted) router.push("/menu");
      }
    };

    // Chờ tối thiểu 1s để màn hình loading hiển thị logo mượt mà
    const timer = setTimeout(() => {
      checkAuth();
    }, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#1c2331] text-white">
      {/* Ảnh Logo 2 mặt */}
      <Image 
        src="/logo.png" 
        alt="Undercover Logo" 
        width={300} 
        height={300} 
        className="rounded-full shadow-[0_0_30px_rgba(255,255,255,0.1)]"
        priority
      />
      
      {/* Chữ Loading nhấp nháy */}
      <h1 className="mt-10 text-4xl font-bold tracking-[0.2em] animate-pulse font-sans">
        LOADING...
      </h1>
    </div>
  );
}