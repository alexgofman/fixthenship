import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FixThenShip",
  description:
    "Review an AI-built app for likely App Store review risks, fix them, and re-check.",
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
