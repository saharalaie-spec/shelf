import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  // Without APP_URL, Next.js uses the Vercel production domain (or localhost) for preview images.
  metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
  title: "Trove",
  description: "Every book, podcast, show and favorite spot you love, in one place. Share your trove with friends.",
  appleWebApp: { capable: true, title: "Trove", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#13110f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster
          position="top-center"
          offset={16}
          mobileOffset={12}
          toastOptions={{
            classNames: {
              toast:
                "!bg-ink !text-paper !border-0 !rounded-2xl !shadow-float !font-sans !text-[15px] !py-3 !px-4",
              // One line, so a toast never grows down over a sheet's header buttons.
              title: "line-clamp-1",
              actionButton: "!bg-paper/15 !text-paper !rounded-full !px-3 !font-medium",
              cancelButton: "!bg-transparent !text-paper/70 !rounded-full !px-2 !font-medium",
              description: "!text-paper/70",
            },
          }}
        />
      </body>
    </html>
  );
}
