import type { Metadata } from "next";
import { Inter, Geist_Mono, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AiAssistant from "./components/AiAssistant";
import ThemeLoader from "./components/ThemeLoader";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Athenia",
  description: "Generate study questions from your notes with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Dark-mode browser extensions stamp attributes onto <html> before React
      // hydrates (e.g. temporarily-dark-simple, native-dark-active), which trips
      // a hydration warning. Suppressing it here only affects <html>'s own
      // attributes — real mismatches inside the app still warn.
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeLoader />
        {children}
        <AiAssistant />
        <Analytics />
      </body>
    </html>
  );
}
