import "@collage/ui/styles.css";
import "@fontsource-variable/space-grotesk";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collage",
  description:
    "Telegram-native Ajo registration, contributions, and payout operations.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  initialScale: 1,
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
