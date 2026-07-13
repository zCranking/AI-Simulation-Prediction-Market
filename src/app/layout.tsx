import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "../components/Nav";
/*import { Analytics } from "@vercel/analytics/next";*/
import type { User } from "../lib/types";

const supabaseConfigured =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').startsWith('http');

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Simulation Prediction Market",
  description:
    "A simulated prediction market where the crowd sets the odds and an AI Analyst competes against them.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let profile: User | null = null;
  if (supabaseConfigured) {
    const { createClient } = await import('../lib/supabase/server');
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      profile = data as User | null;
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        {profile && <Nav user={profile} />}
        {children}
        {/* <Analytics /> */}
      </body>
    </html>
  );
}
