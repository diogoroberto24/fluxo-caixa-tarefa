"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function Sidebar({ onNavigate, aiEnabled = false }: { onNavigate?: () => void; aiEnabled?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] flex-col bg-navy px-4 text-slate-200">
      <div className="-mx-4 flex h-[84px] items-center gap-2 border-b border-white/10 px-6">
        <span className="font-serif text-[40px] font-bold italic leading-none tracking-[-4px] text-white">
          AC
        </span>
        <div className="leading-tight">
          <div className="whitespace-nowrap font-serif text-xl font-bold text-white">
            Anderson Cardozo
          </div>
          <div className="mt-0.5 text-[8.5px] tracking-[0.22em] text-slate-300">
            ASSESSORIA CONTÁBIL
          </div>
        </div>
      </div>

      <nav aria-label="Principal" className="mt-5 flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => aiEnabled || !item.requiresAi).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3.5 rounded-md px-3.5 text-sm transition-colors",
                active
                  ? "bg-navy-700 font-medium text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.7} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pb-14 pl-4 text-[10.5px] leading-[17px] tracking-[0.3em] text-slate-400">
        <div>SEU NEGÓCIO</div>
        <div>EM BOAS MÃOS</div>
        <div className="mt-3 h-px w-8 bg-slate-500" />
      </div>
    </aside>
  );
}
