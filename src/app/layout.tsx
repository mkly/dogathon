import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Toaster } from "sonner";

import { FeltFilters } from "@/components/felt";

import "./felt.css";
import "./globals.css";
import toastStyles from "./toaster.module.css";

// The sirius-proto mockups load Nunito wght 500–900 from Google Fonts.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Dogathon | Sponsor a rescue companion",
  description: "Sponsor a rescue companion for $25 a month until adoption.",
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
        <Toaster
          closeButton
          gap={12}
          mobileOffset={14}
          offset={18}
          position="bottom-left"
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: toastStyles.toast,
              title: toastStyles.title,
              content: toastStyles.content,
              closeButton: toastStyles.closeButton,
              icon: toastStyles.icon,
              success: toastStyles.success,
              warning: toastStyles.warning,
              error: toastStyles.error,
            },
          }}
        />
      </body>
    </html>
  );
}
