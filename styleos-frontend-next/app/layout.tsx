import type { Metadata } from "next";
import "../styles/tokens.css";
import "./globals.css";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "StyleOS",
  description: "Goal-based AI stylist — describe who you're trying to become, StyleOS builds the cart.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
