import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JACKPOT CULTURAL — Revista cultural internacional impulsada por el azar",
  description:
    "Accioná la palanca, descubrí un país al azar y leé de qué está hablando su cultura esta semana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${newsreader.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}