import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Embeddings vs MCP Demo",
  description:
    "A lightweight support-ticket demo that compares literal MCP-style retrieval with semantic embedding search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
