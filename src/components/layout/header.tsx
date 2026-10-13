"use client";

import { CalendarDays, LogOut, Menu } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { useAppStore } from "@/components/providers/app-store";
import { longDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";

function initials(name: string) {
  const parts = name.split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { today, currentUser } = useAppStore();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menu"
        className="rounded-md p-2 text-ink hover:bg-surface lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden min-w-0 md:block">
        <div className="truncate text-sm font-semibold text-navy">
          Anderson Cardozo Assessoria Contábil
        </div>
        <div className="text-xs text-slate-500">Painel de gestão</div>
      </div>

      <div className="ml-auto flex items-center gap-5 sm:gap-10">
        <div className="hidden items-center gap-2 sm:flex">
          <CalendarDays className="h-5 w-5 text-ink" strokeWidth={1.6} />
          <div className="leading-tight">
            <div className="text-[13px] font-medium">{longDate(today)}</div>
            <div className="text-[11px] text-slate-500">Horário de Brasília</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-full bg-navy text-xs font-semibold text-white"
          >
            {initials(currentUser.name)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium">{currentUser.name}</div>
            <div className="text-[11px] text-slate-500">{ROLE_LABEL[currentUser.role]}</div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              aria-label="Sair"
              className="rounded-md p-2 text-slate-500 hover:bg-surface hover:text-ink"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
