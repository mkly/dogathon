import type { Metadata } from "next";
import { Nunito } from "next/font/google";

import { FeltFilters } from "@/components/felt";
import { ToastViewport } from "@/components/toast";

import "./felt.css";
import "./globals.css";

// The sirius-proto mockups load Nunito wght 500–900 from Google Fonts.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Dogathon | Sponsor a rescue dog",
  description: "Sponsor a rescue dog for $25 a month until adoption.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Browser extensions can add attributes such as data-google-analytics-opt-out
    // before React hydrates this element. Ignore only those root-level differences.
    <html lang="en" suppressHydrationWarning>
      <body className={nunito.className}>
        <FeltFilters />
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
