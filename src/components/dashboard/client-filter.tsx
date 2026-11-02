"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { formatDocument } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchClients } from "@/services/clients";

const MAX = 8;

/** Campo compacto para filtrar as tarefas por cliente (nome, CNPJ/CPF, IE). */
export function ClientFilter({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { clients } = useAppStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = clients.find((c) => c.id === selectedId);
  const results = useMemo(() => (query.trim() ? searchClients(clients, query).slice(0, MAX) : []), [clients, query]);

  function choose(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft pl-3 pr-1 text-[13px]">
        <span className="truncate text-navy">
          Cliente: <strong className="font-semibold">{selected.tradeName}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-label="Remover filtro de cliente"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white hover:text-navy"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full min-w-0 sm:w-[300px]">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!results.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
            else if (e.key === "Enter") { e.preventDefault(); choose(results[active].id); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Filtrar por cliente (nome, CNPJ…)"
          aria-label="Filtrar tarefas por cliente"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
        />
      </label>
      {open && query.trim() && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">Nenhum cliente encontrado.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); choose(c.id); }}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer px-3 py-2", i === active && "bg-primary-soft")}
              >
                <div className="truncate text-[13px] font-medium text-navy">{c.tradeName}</div>
                <div className="truncate text-[11px] text-slate-500">{formatDocument(c.document)} · {c.legalName}</div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
