import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "ReasonsIQ — AI Spend Optimization",
  description: "Are you overpaying for AI? Analyze your setup and find the optimal strategy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f7f7f8] text-[#1a1a1a] antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
