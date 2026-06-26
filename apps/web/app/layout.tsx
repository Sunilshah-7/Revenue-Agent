import type { Metadata } from "next";
import { Navbar } from "../components/ui/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARAP",
  description: "Automated revenue research and business-case generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base font-sans text-text-primary antialiased">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
