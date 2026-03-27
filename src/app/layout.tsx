import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoostHive",
  description: "BoostHive Workspace Access",
  icons: {
    icon: "/favicon_dark.png",
    shortcut: "/favicon_dark.png",
    apple: "/favicon_dark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
