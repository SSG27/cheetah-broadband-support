import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cheetah Broadband | Customer Care",
  description: "Fast, friendly broadband support from Cheetah Broadband.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
