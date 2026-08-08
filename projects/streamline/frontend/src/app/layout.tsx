import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { InvisibleTurnstile } from "@/components/providers/InvisibleTurnstile";
import { SuiProviders } from "@/components/providers/SuiProviders";
import { PhoneToaster } from "@/components/ui/PhoneToaster";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "StreamLine — Programmable Micropayments on Sui",
    template: "%s | StreamLine",
  },
  description:
    "Gasless, milestone-gated, composable payment streams on Sui. Money that drips in real time as you work.",
  applicationName: "StreamLine",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable}`}>
      <body>
        <InvisibleTurnstile />
        <SuiProviders>
          {children}
          <PhoneToaster />
        </SuiProviders>
      </body>
    </html>
  );
}
