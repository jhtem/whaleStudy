import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "whaleStudy | 스터디룸 통합 관리 시스템",
  description: "실시간 예약 현황 파악 및 매출 통계 분석을 제공하는 효율적인 스터디룸 관리자 대시보드입니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
