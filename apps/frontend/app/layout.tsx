import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ndstill — websites from a sentence",
  description: "Describe a website in plain words. ndstill writes the React code, shows it live as it builds, and opens it in an editor you can keep changing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#15141f",
          colorText: "#15141f",
          fontFamily: "var(--font-instrument-sans)",
          borderRadius: "0.75rem",
        },
      }}
    >
      <html lang="en" className={`${instrumentSans.variable} ${unbounded.variable} ${geistMono.variable}`}>
        <body className="antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
