import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Renta Work",
  description: "Tu portfolio de inversiones en dólares.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1b2d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
