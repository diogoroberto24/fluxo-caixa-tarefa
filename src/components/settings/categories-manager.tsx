"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { createCategoryAction, updateCategoryAction } from "@/app/(app)/configuracoes/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { cn } from "@/lib/utils";
import type { FinancialCategory, PayableScope } from "@/types/domain";

type Changes = Partial<Pick<FinancialCategory, "name" | "active" | "forEmpresa" | "forPessoal">>;
type DragSource = "LIST" | PayableScope;

const SCOPE = {
  EMPRESA: { label: "Empresa", flag: "forEmpresa", mark: "bg-primary", over: "border-primary ring-2 ring-primary/15", check: "checked:border-primary checked:bg-primary" },
  PESSOAL: { label: "Pessoal", flag: "forPessoal", mark: "bg-personal", over: "border-personal ring-2 ring-personal/15", check: "checked:border-personal checked:bg-personal" },
} as const satisfies Record<PayableScope, unknown>;

const SCOPES: PayableScope[] = ["EMPRESA", "PESSOAL"];

const linkButton = "rounded px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-surface hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

/** Gerenciador das categorias de contas a pagar: criar, renomear, desativar e ligar a Empresa/Pessoal. */
export function CategoriesManager() {
  const { categories, payables, splitPayables, notify } = useAppStore();
  // cópia local para a tela responder na hora; volta a seguir o servidor a cada atualização
  const [items, setItems] = useState(categories);
  useEffect(() => setItems(categories), [categories]);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [overZone, setOverZone] = useState<PayableScope | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payables) if (!p.canceled) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    return m;
  }, [payables]);

  const active = items.filter((c) => c.active);
  const inactive = items.filter((c) => !c.active);

  async function save(id: string, changes: Changes, okMessage?: string) {
    setItems((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    setBusy((s) => new Set(s).add(id));
    const r = await updateCategoryAction(id, changes);
    setBusy((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    if (!r.ok) {
      setItems(categories);
      notify(r.error, "error");
      return false;
    }
    if (okMessage) notify(okMessage);
    return true;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const r = await createCategoryAction(newName);
    setCreating(false);
    if (!r.ok) return notify(r.error, "error");
    notify(splitPayables ? "Categoria criada em Empresa." : "Categoria criada.");
    setNewName("");
    setAdding(false);
  }

  function closeAdd() {
    setAdding(false);
    setNewName("");
  }

  async function onRename(c: FinancialCategory) {
    const name = editName.replace(/\s+/g, " ").trim();
    if (!name || name === c.name) return setEditingId(null);
    if (await save(c.id, { name }, "Categoria renomeada.")) setEditingId(null);
  }

  function toggleScope(c: FinancialCategory, scope: PayableScope) {
    const flag = SCOPE[scope].flag;
    save(c.id, { [flag]: !c[flag] });
  }

  // ---------------------------------------------------------------- arrastar e soltar
  function onDragStart(e: DragEvent, id: string, from: DragSource) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id, from }));
    e.dataTransfer.effectAllowed = from === "LIST" ? "copy" : "move";
  }

  function onDrop(e: DragEvent, to: PayableScope) {
    e.preventDefault();
    setOverZone(null);
    let payload: { id: string; from: DragSource };
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    const c = items.find((x) => x.id === payload.id);
    if (!c || payload.from === to) return;
    // da lista: só inclui; de um quadro para o outro: move
    if (payload.from === "LIST" && c[SCOPE[to].flag]) return;
    const changes: Changes = { [SCOPE[to].flag]: true };
    if (payload.from !== "LIST") changes[SCOPE[payload.from].flag] = false;
    save(c.id, changes);
  }

  const cols = splitPayables
    ? "md:grid-cols-[minmax(0,1fr)_56px_64px_64px_150px]"
    : "md:grid-cols-[minmax(0,1fr)_56px_150px]";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-[16px] font-semibold text-navy">
          Categorias de contas a pagar
          <span className="ml-2 text-sm font-normal text-slate-500">{active.length} ativas</span>
        </h2>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Nova categoria
          </Button>
        )}
      </div>

      <div className={cn("grid", splitPayables && "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        {/* ------------------------------------------------ tabela */}
        <div className="min-w-0 px-5 pb-4 pt-3">
          {adding && (
            <form onSubmit={onCreate} className="mb-3 flex gap-2">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeAdd()}
                placeholder="Nome da categoria"
                maxLength={60}
                aria-label="Nome da nova categoria"
              />
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
              <Button variant="ghost" onClick={closeAdd}>
                Cancelar
              </Button>
            </form>
          )}

          <div className={cn("hidden gap-3 rounded-md bg-surface px-3 py-2 text-xs font-medium text-slate-600 md:grid", cols)}>
            <span>Categoria</span>
            <span className="text-right">Contas</span>
            {splitPayables &&
              SCOPES.map((s) => (
                <span key={s} className="text-center">
                  {SCOPE[s].label}
                </span>
              ))}
            <span />
          </div>

          <ul>
            {active.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">Nenhuma categoria ativa.</li>}
            {active.map((c) => {
              const count = usage.get(c.id) ?? 0;
              const noScope = splitPayables && !c.forEmpresa && !c.forPessoal;
              const editing = editingId === c.id;
              return (
                <li
                  key={c.id}
                  draggable={splitPayables && !editing}
                  onDragStart={(e) => onDragStart(e, c.id, "LIST")}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2.5 text-[13px] last:border-0",
                    !editing && cols,
                    splitPayables && !editing && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  {editing ? (
                    <form
                      className="col-span-full flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        onRename(c);
                      }}
                    >
                      <Input
                        autoFocus
                        value={editName}
                        maxLength={60}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                        className="h-9"
                        aria-label={`Novo nome para ${c.name}`}
                      />
                      <Button type="submit" size="sm" className="h-9">
                        Salvar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-navy">{c.name}</span>
                        {noScope && <span className="text-xs font-medium text-warning">Sem tipo</span>}
                        {busy.has(c.id) && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                      </div>
                      <span className="text-right tabular-nums text-slate-500">
                        <span className="md:hidden">Contas: </span>
                        {count}
                      </span>
                      {splitPayables &&
                        SCOPES.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-slate-600 md:justify-center">
                            {/* caixa desenhada pelo próprio app: a cor do tipo aparece igual em qualquer navegador */}
                            <span className="relative inline-flex h-4 w-4 shrink-0">
                              <input
                                type="checkbox"
                                checked={c[SCOPE[s].flag]}
                                onChange={() => toggleScope(c, s)}
                                className={cn(
                                  "peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-slate-300 bg-white transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                  SCOPE[s].check,
                                )}
                                aria-label={`${c.name} em ${SCOPE[s].label}`}
                              />
                              <Check
                                className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
                                strokeWidth={3}
                                aria-hidden
                              />
                            </span>
                            <span className="md:hidden">{SCOPE[s].label}</span>
                          </label>
                        ))}
                      <div className="col-span-full flex justify-end gap-1 md:col-span-1">
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() => {
                            setEditingId(c.id);
                            setEditName(c.name);
                          }}
                        >
                          Renomear
                        </button>
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() => save(c.id, { active: false }, `"${c.name}" desativada. Ela não aparece mais nas contas novas.`)}
                        >
                          Desativar
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {inactive.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className={linkButton}
                aria-expanded={showInactive}
              >
                {showInactive ? "Ocultar" : "Mostrar"} desativadas ({inactive.length})
              </button>
              {showInactive && (
                <ul className="mt-1">
                  {inactive.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-0">
                      <span className="flex-1 truncate text-slate-500">{c.name}</span>
                      <span className="tabular-nums text-slate-400">{usage.get(c.id) ?? 0}</span>
                      <button
                        type="button"
                        className={cn(linkButton, "text-primary hover:text-primary")}
                        onClick={() => save(c.id, { active: true }, `"${c.name}" reativada.`)}
                      >
                        Reativar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------ quadros Empresa / Pessoal */}
        {splitPayables && (
          <aside className="flex min-w-0 flex-col gap-3 border-t border-line bg-surface/60 p-4 lg:border-l lg:border-t-0">
            {SCOPES.map((s) => {
              const inZone = active.filter((c) => c[SCOPE[s].flag]);
              return (
                <section
                  key={s}
                  aria-label={`Categorias de ${SCOPE[s].label}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverZone(s);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverZone(null);
                  }}
                  onDrop={(e) => onDrop(e, s)}
                  className={cn(
                    "rounded-lg border border-line bg-white transition-[border-color,box-shadow] duration-150",
                    overZone === s && SCOPE[s].over,
                  )}
                >
                  <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] font-semibold text-navy">
                    <span className={cn("h-2 w-2 rounded-[2px]", SCOPE[s].mark)} aria-hidden />
                    {SCOPE[s].label}
                    <span className="ml-auto text-xs font-medium text-slate-500">{inZone.length}</span>
                  </div>
                  <ul className="min-h-[44px] py-1">
                    {inZone.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-slate-500">Nenhuma categoria</li>
                    ) : (
                      inZone.map((c) => (
                        <li
                          key={c.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, c.id, s)}
                          className="flex cursor-grab items-center justify-between px-3 py-1 text-[13px] text-ink hover:bg-surface active:cursor-grabbing"
                        >
                          <span className="truncate">{c.name}</span>
                          <button
                            type="button"
                            onClick={() => save(c.id, { [SCOPE[s].flag]: false })}
                            className="rounded p-1 text-slate-400 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            aria-label={`Tirar ${c.name} de ${SCOPE[s].label}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
            <p className="text-xs text-slate-500">Arraste da lista para incluir. Entre os quadros, arrastar move.</p>
          </aside>
        )}
      </div>
    </Card>
  );
}
