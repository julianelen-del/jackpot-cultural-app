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

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://jackpot-cultural-app.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title:
    "JACKPOT CULTURAL — Música, cine, series y libros del mundo por azar",
  description:
    "Revista cultural internacional semanal con escena indie, rock, cine de autor, series, libros, podcasts, festivales y radios de 27 países.",
  keywords: [
    "revista cultural",
    "música indie",
    "rock alternativo",
    "cine independiente",
    "series",
    "libros",
    "podcasts culturales",
    "festivales",
    "cultura internacional",
  ],
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "JACKPOT CULTURAL",
    title:
      "JACKPOT CULTURAL — Música, cine, series y libros del mundo por azar",
    description:
      "Accioná la palanca, descubrí un país al azar y leé qué está moviendo su escena cultural esta semana.",
  },
  twitter: {
    card: "summary_large_image",
    title: "JACKPOT CULTURAL",
    description:
      "Música, rock, cine, series, libros, podcasts y festivales de 27 países en una tirada al azar.",
  },
  robots: {
    index: true,
    follow: true,
  },
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