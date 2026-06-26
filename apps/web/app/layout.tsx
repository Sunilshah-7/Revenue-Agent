import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Revenue Agent Platform",
  description: "Automated revenue research and business-case generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
