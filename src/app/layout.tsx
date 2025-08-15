import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

import ErrorBoundary from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Professional Subnet Calculator | IPv4/IPv6 Network Planning for AWS, Azure & Google Cloud",
  description: "Advanced subnet calculator and network planning tool for cloud infrastructure. Calculate IPv4/IPv6 subnets, split networks, join subnets, and export configurations for AWS VPC, Azure VNet, and Google Cloud VPC with automatic cloud provider IP reservations.",
  keywords: [
    "subnet calculator",
    "network planning",
    "IPv4 calculator",
    "IPv6 calculator",
    "AWS VPC subnetting",
    "Azure VNet calculator",
    "Google Cloud VPC",
    "CIDR calculator",
    "network infrastructure",
    "cloud networking",
    "subnet splitting",
    "network design",
    "IP address calculator"
  ],
  authors: [{ name: "Dan Jones", url: "https://artofinfra.com" }],
  creator: "Dan Jones - Art of Infrastructure",
  publisher: "Art of Infrastructure",
  openGraph: {
    title: "Professional Subnet Calculator for Cloud Infrastructure",
    description: "Calculate IPv4/IPv6 subnets for AWS, Azure, and Google Cloud. Advanced network planning with subnet splitting, joining, and cloud provider IP reservations.",
    url: "https://subnet-calculator.artofinfra.com",
    siteName: "Art of Infrastructure Subnet Calculator",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Professional Subnet Calculator for Cloud Infrastructure",
    description: "Calculate IPv4/IPv6 subnets for AWS, Azure, and Google Cloud with advanced network planning features.",
    creator: "@artofinfra",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "Technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Professional Subnet Calculator",
    "description": "Advanced subnet calculator and network planning tool for cloud infrastructure. Calculate IPv4/IPv6 subnets for AWS VPC, Azure VNet, and Google Cloud VPC.",
    "url": "https://subnet-calculator.artofinfra.com",
    "applicationCategory": "NetworkingApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "creator": {
      "@type": "Person",
      "name": "Dan Jones",
      "url": "https://artofinfra.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Art of Infrastructure",
      "url": "https://artofinfra.com"
    },
    "featureList": [
      "IPv4 and IPv6 subnet calculation",
      "AWS VPC subnet planning",
      "Azure VNet subnet planning",
      "Google Cloud VPC subnet planning",
      "Subnet splitting and joining",
      "Cloud provider IP reservation handling",
      "Network configuration export",
      "CIDR notation support"
    ],
    "browserRequirements": "Requires JavaScript. Compatible with modern web browsers."
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
