import type { Metadata } from "next";
import { Familjen_Grotesk, Azeret_Mono } from "next/font/google";
import "./globals.css";
import { SITE, NAV } from "@/config/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const display = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
  display: "swap",
});

const mono = Azeret_Mono({
  variable: "--font-azeret",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.liveUrl),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.author, url: "https://github.com/aniruddhaadak80" }],
  creator: SITE.author,
  keywords: [
    "post-quantum cryptography",
    "harvest now decrypt later",
    "quantum computing",
    "TLS certificate analysis",
    "certificate transparency",
    "ML-KEM",
    "ML-DSA",
    "cryptographic key rotation",
    "quantum security",
    "MCP",
    "open source security tool",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE.liveUrl,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  category: "technology",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceff4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1118" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:border focus:border-signal-live focus:bg-panel focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader navigation={NAV.map((item) => ({ href: item.href, label: item.label }))} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter navigation={NAV.map((item) => ({ href: item.href, label: item.label }))} />
      </body>
    </html>
  );
}