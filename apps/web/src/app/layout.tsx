import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RemoteIDE — Browser Remote Development Environment",
  description: "Secure, local-first browser-based remote development environment",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ide-bg text-zinc-100 antialiased overflow-hidden">{children}</body>
    </html>
  );
}
