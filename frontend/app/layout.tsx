import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import "./globals.css";
import SessionGuard from "@/components/SessionGuard";
import VolumeControl from "@/components/VolumeControl";

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
        {/* Âm thanh toàn cục - Luôn tồn tại trong DOM, không bao giờ bị unmount khi chuyển trang */}
        <audio id="sound-click" src="/sounds/click.mp3" preload="auto" className="hidden" />
        <audio id="sound-ready" src="/sounds/ready.mp3" preload="auto" className="hidden" />
        <audio id="sound-start" src="/sounds/start.mp3" preload="auto" className="hidden" />
        <audio id="sound-vote" src="/sounds/vote.mp3" preload="auto" className="hidden" />
        <audio id="sound-alert" src="/sounds/alert.mp3" preload="auto" className="hidden" />
        <audio id="sound-tick" src="/sounds/tick.mp3" preload="none" className="hidden" />
        <audio id="sound-win" src="/sounds/win.mp3" preload="none" className="hidden" />
        <audio id="sound-lose" src="/sounds/lose.mp3" preload="none" className="hidden" />
        <audio id="sound-bgm" src="/sounds/pink-panther.mp3" preload="none" loop className="hidden" />
        <audio id="sound-bgm-game" src="/sounds/tunetank-jazz-spy-music-349626.mp3" preload="none" loop className="hidden" />
        
        <SessionGuard />
        <VolumeControl />
        {children}
      </body>
    </html>
  );
}