import type { Metadata } from "next";

import { FeltFilters } from "@/components/felt";

import "./felt.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dogathon",
  description: "A basic Next.js app with Better Auth and Prisma",
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
