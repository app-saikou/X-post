import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X 予約投稿カレンダー",
  description: "Xの予約投稿をカレンダーで視覚的に管理",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
