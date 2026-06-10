import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Production Hub - 제작공정 대시보드",
  description: "실시간 제작공정 모니터링 및 분석",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full bg-black font-sans" suppressHydrationWarning>
        <div className="flex h-screen bg-black text-white overflow-hidden">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
