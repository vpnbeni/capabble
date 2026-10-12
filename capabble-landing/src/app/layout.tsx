import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "react-hot-toast";
import { CursorGlow } from "@/components/CursorGlow";

const siteTitle = "Capabble | Software, AI and ERP for schools";
const siteDescription =
  "Capabble develops, licenses, implements and maintains SaaS platforms, AI applications and ERP for schools and the organisations around them.";

// Favicon, Apple touch icon and the link-preview image come from the file
// conventions in this folder (favicon.ico, icon.svg, apple-icon.png,
// opengraph-image.jpg, twitter-image.jpg).
export const metadata: Metadata = {
  metadataBase: new URL("https://www.capabble.cloud"),
  title: siteTitle,
  description: siteDescription,
  keywords: [
    "capabble",
    "school os",
    "school erp",
    "school management software",
    "cbse school software",
    "exam centre management",
    "fee management",
    "multi-tenant education software",
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    type: "website",
    locale: "en_IN",
    siteName: "Capabble",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <CursorGlow />
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "dark:bg-brand-900 dark:text-brand-100",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
