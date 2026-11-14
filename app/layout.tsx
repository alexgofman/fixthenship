import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import "./pricing/pricing.css";

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
              <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="14" fill="#F2500F" />
                <path
                  d="M15 33l11 11 23-23M36 21h13v13"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="brand-word">
                Fix<span>Then</span>Ship
              </span>
            </Link>
            <nav className="site-nav" aria-label="Main">
              <Link href="/">Check an app</Link>
              <Link href="/pricing">Pricing</Link>
            </nav>
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
