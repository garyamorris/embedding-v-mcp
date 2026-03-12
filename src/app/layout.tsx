import type { Metadata } from "next";

import { uiCopy } from "@/lib/ui-copy";
import "./globals.css";

export const metadata: Metadata = {
  title: uiCopy.metadata.appTitle,
  description: uiCopy.metadata.appDescription,
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
