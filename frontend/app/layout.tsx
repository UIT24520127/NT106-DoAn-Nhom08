import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import "./globals.css";
import SessionGuard from "@/components/SessionGuard";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

const nunito = Nunito({
  subsets: ["latin", "vietnamese"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
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
        className={`${inter.variable} ${nunito.variable} font-sans antialiased`}
      >
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}