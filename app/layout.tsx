import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FixThenShip",
  description:
    "A dress rehearsal for App Review: find what would likely get your app rejected, fix it, and check again.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@700;800&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                ✓
              </span>
              FixThenShip
            </Link>
            <span className="site-tag">App Review rehearsal</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          FixThenShip describes likely review outcomes and risks. It is not affiliated with Apple.
        </footer>
      </body>
    </html>
  );
}
