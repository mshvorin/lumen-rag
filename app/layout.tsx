import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumen · Document Intelligence",
  description: "Bring your documents together. Search your knowledge and get grounded answers with sources.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
