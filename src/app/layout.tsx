import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InferenceIQ — LLM Cost Intelligence",
  description: "Compare LLM API pricing, GPU compute costs, and find the optimal deployment strategy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f7f7f8] text-[#1a1a1a] antialiased">
        {children}
      </body>
    </html>
  );
}
