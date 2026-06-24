"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoadingScreen() {
  const router = useRouter();

  useEffect(() => {
    // Đợi 3 giây (3000ms) rồi tự động chuyển sang trang login
    const timer = setTimeout(() => {
      const token = sessionStorage.getItem("token");
      if (token) {
        router.push("/menu");
      } else {
        router.push("/login");
      }
    }, 3000);
    return () => clearTimeout(timer);
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