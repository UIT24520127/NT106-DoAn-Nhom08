import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Thay thế font Geist bằng Inter để hỗ trợ hoàn hảo dấu Tiếng Việt
const inter = Inter({
  subsets: ["latin", "vietnamese"],
});

// Sẵn tiện mình đổi luôn Tiêu đề tab trình duyệt cho ngầu đúng chất game nhé!
export const metadata: Metadata = {
  title: "Undercover | Ai là gián điệp?",
  description: "Trò chơi suy luận tìm ra kẻ ẩn nặc - Undercover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Đổi lang="en" thành lang="vi" để tối ưu cho trình duyệt
    <html lang="vi">
      <body
        className={`${inter.className} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}