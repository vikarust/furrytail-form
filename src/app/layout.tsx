import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Furrytail Pet Grooming Salon & Dog Hotel",
  description: "Pendaftaran pelanggan & hewan peliharaan baru di Furrytail Pet Grooming Salon & Dog Hotel.",
  openGraph: {
    title: "Furrytail Pet Grooming Salon & Dog Hotel",
    description: "Pendaftaran pelanggan & hewan peliharaan baru di Furrytail Pet Grooming Salon & Dog Hotel.",
    images: ["/logo.png"],
    type: "website",
  },
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}