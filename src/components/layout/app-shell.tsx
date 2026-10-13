"use client";

import { FlaskConical, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Toaster } from "@/components/ui/toaster";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { clients } = useAppStore();
  const hasDemo = clients.some((c) => c.isDemo);

  return (
    <div className="min-h-screen">
      {/* Sidebar fixa (desktop) */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block print:hidden">
        <Sidebar />
      </div>

      {/* Drawer (tablet/celular) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-[260px]">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-md p-2 text-white/80 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-[260px] print:pl-0">
        <div className="print:hidden"><Header onMenu={() => setMenuOpen(true)} /></div>
        {hasDemo && (
          <div className="print:hidden flex items-center gap-2 border-b border-warning-line bg-warning-soft px-4 py-1.5 text-xs text-warning sm:px-8">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Dados de demonstração presentes.</strong> Antes da operação real, rode <code>npm run clear:demo</code> para removê-los.
            </span>
          </div>
        )}
        <main className="px-4 py-6 sm:px-8">{children}</main>
      </div>
      <div className="print:hidden"><Toaster /></div>
    </div>
  );
}
