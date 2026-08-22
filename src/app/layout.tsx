import type { Metadata } from "next";

import { FeltFilters } from "@/components/felt";

import "./felt.css";
import "./globals.css";

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
    <html lang="en">
      <body>
        <FeltFilters />
        {children}
      </body>
    </html>
  );
}
