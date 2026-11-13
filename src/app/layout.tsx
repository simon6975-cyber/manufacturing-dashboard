import type { Metadata } from "next";
import "./globals.css";
import LayoutShell from "@/components/LayoutShell";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";

export const metadata: Metadata = {
  title: "Production Hub - 제작공정 대시보드",
  description: "실시간 제작공정 모니터링 및 분석",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 저장된 테마를 그리기 전에 적용 — 화이트 테마 사용자의 검은 화면 깜박임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full bg-black font-sans" suppressHydrationWarning>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
