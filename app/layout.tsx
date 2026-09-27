import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMA Apotek - Sistem Informasi Manajemen & Kasir Farmasi",
  description: "Production-grade Pharmacy Management System with FEFO and Multi-Unit conversions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-background antialiased selection:bg-emerald-500/20 selection:text-emerald-700">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
