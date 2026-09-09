import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Toaster } from "sonner";

import feltStyles from "@/components/felt.module.css";
import { FeltFilters } from "@/components/felt";

import "./felt.css";
import "./globals.css";
import { QueryProvider } from "./query-provider";
import toastStyles from "./toaster.module.css";

// The sirius-proto mockups load Nunito wght 500–900 from Google Fonts.
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Dogathon | Sponsor a rescue companion",
  description:
    "Sponsor a rescue companion month by month for as long as they need it.",
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
        <QueryProvider>
          <FeltFilters />
          {children}
          <Toaster
            closeButton
            // the hand-rolled viewport stacked every toast at once; `expand`
            // keeps that (and is what makes `gap` apply)
            expand
            gap={12}
            mobileOffset={14}
            offset={18}
            position="bottom-left"
            toastOptions={{
              unstyled: true,
              classNames: {
                // the felt patch itself stays the shared primitive; the module
                // only adds toast layout on top of it
                toast: `${feltStyles["felt-panel"]} ${toastStyles.toast}`,
                title: toastStyles.title,
                content: toastStyles.content,
                closeButton: toastStyles.closeButton,
                icon: toastStyles.icon,
                success: "felt-moss",
                warning: "felt-mustard",
                error: "felt-brick",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
