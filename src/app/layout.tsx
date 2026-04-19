import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import { ThemeBootstrap } from "@/lib/client/theme-provider";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Statusbar } from "@/components/shell/statusbar";
import { TweaksPanel } from "@/components/overlays/tweaks-panel";
import { CommandPalette } from "@/components/overlays/command-palette";
import { ApprovalModalHost } from "@/components/overlays/approval-modal";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-poppins" });

export const metadata: Metadata = {
  title: "Cockpit — pilot Claude Code sessions in parallel",
  description: "Dashboard for piloting multiple Claude Code sessions via the Agent SDK.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable} ${poppins.variable}`}>
      <body>
        <div className="app">
          <Sidebar />
          <Topbar />
          <main className="main">{children}</main>
          <Statusbar />
        </div>
        <ThemeBootstrap />
        <TweaksPanel />
        <CommandPalette />
        <ApprovalModalHost />
      </body>
    </html>
  );
}
