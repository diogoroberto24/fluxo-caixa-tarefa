"use client";

import { Check, GripVertical, Loader2, Pencil, Plus, Tags, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { createCategoryAction, updateCategoryAction } from "@/app/(app)/configuracoes/actions";
import { useAppStore } from "@/components/providers/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/fields";
import { cn } from "@/lib/utils";
import type { FinancialCategory, PayableScope } from "@/types/domain";

type Changes = Partial<Pick<FinancialCategory, "name" | "active" | "forEmpresa" | "forPessoal">>;
type DragSource = "LIST" | PayableScope;

const SCOPE = {
  EMPRESA: {
    label: "Empresa",
    flag: "forEmpresa",
    box: "border-primary/30 bg-primary-soft/40",
    over: "border-primary bg-primary-soft",
    chip: "bg-white text-primary border-primary/30",
    pill: "border-primary bg-primary text-white",
  },
  PESSOAL: {
    label: "Pessoal",
    flag: "forPessoal",
    box: "border-violet-200 bg-violet-50/50",
    over: "border-violet-500 bg-violet-100",
    chip: "bg-white text-violet-700 border-violet-200",
    pill: "border-violet-600 bg-violet-600 text-white",
  },
} as const satisfies Record<PayableScope, unknown>;

const SCOPES: PayableScope[] = ["EMPRESA", "PESSOAL"];

/** Gerenciador das categorias de contas a pagar: criar, renomear, desativar e ligar a Empresa/Pessoal. */
export function CategoriesManager() {
  const { categories, payables, splitPayables, notify } = useAppStore();
  // cópia local para a tela responder na hora; volta a seguir o servidor a cada atualização
  const [items, setItems] = useState(categories);
  useEffect(() => setItems(categories), [categories]);

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
    notify(splitPayables ? "Categoria criada em Empresa. Arraste para Pessoal se precisar." : "Categoria criada.");
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
    const changes: Changes = { [SCOPE[to].flag]: true };
    // de um card para o outro: move; da lista: só adiciona
    if (payload.from !== "LIST") changes[SCOPE[payload.from].flag] = false;
    if (c[SCOPE[to].flag] && payload.from === "LIST") return;
    save(c.id, changes);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[16px]">
          <Tags className="h-5 w-5 text-navy" strokeWidth={1.8} /> Gerenciador de categorias
        </CardTitle>
      </CardHeader>
      <p className="px-5 pt-1 text-xs text-slate-500">
        {splitPayables
          ? "Arraste cada categoria para o card do tipo de conta em que ela deve aparecer. A mesma categoria pode ficar nos dois."
          : "Categorias usadas nas contas a pagar. Com a separação Empresa/Pessoal ligada (aba Preferências), você também escolhe em qual tipo cada categoria aparece."}
      </p>

      <div className={cn("grid gap-5 p-5", splitPayables && "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
        {/* ------------------------------------------------ lista */}
        <div className="flex min-w-0 flex-col gap-3">
          <form onSubmit={onCreate} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nova categoria"
              maxLength={60}
              aria-label="Nome da nova categoria"
            />
            <Button type="submit" disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </form>

          <ul className="divide-y divide-line rounded-lg border border-line">
            {active.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">Nenhuma categoria ativa.</li>}
            {active.map((c) => {
              const count = usage.get(c.id) ?? 0;
              const noScope = splitPayables && !c.forEmpresa && !c.forPessoal;
              return (
                <li
                  key={c.id}
                  draggable={splitPayables && editingId !== c.id}
                  onDragStart={(e) => onDragStart(e, c.id, "LIST")}
                  className={cn("flex flex-wrap items-center gap-2 px-3 py-2.5", splitPayables && "cursor-grab active:cursor-grabbing")}
                >
                  {splitPayables && <GripVertical className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden />}
                  {editingId === c.id ? (
                    <form
                      className="flex min-w-0 flex-1 gap-1.5"
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
                        className="h-8"
                        aria-label={`Novo nome para ${c.name}`}
                      />
                      <Button type="submit" size="icon" className="h-8 w-8 shrink-0" aria-label="Salvar nome">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Cancelar" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-sm font-medium text-navy">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-surface hover:text-navy"
                        aria-label={`Renomear ${c.name}`}
                        title="Renomear"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {busy.has(c.id) && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                    </div>
                  )}
                  <span className="text-xs text-slate-500">{count === 1 ? "1 conta" : `${count} contas`}</span>
                  {noScope && <Badge tone="warning">sem tipo</Badge>}
                  {splitPayables && (
                    <div className="flex gap-1">
                      {SCOPES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={c[SCOPE[s].flag]}
                          onClick={() => toggleScope(c, s)}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                            c[SCOPE[s].flag] ? SCOPE[s].pill : "border-line bg-white text-slate-500 hover:text-navy",
                          )}
                        >
                          {SCOPE[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => save(c.id, { active: false }, `"${c.name}" desativada. Ela não aparece mais nas contas novas.`)}
                  >
                    Desativar
                  </Button>
                </li>
              );
            })}
          </ul>

          {inactive.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
                aria-expanded={showInactive}
              >
                {showInactive ? "Ocultar" : "Mostrar"} desativadas ({inactive.length})
              </button>
              {showInactive && (
                <ul className="mt-2 divide-y divide-line rounded-lg border border-dashed border-line">
                  {inactive.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 truncate text-sm text-slate-500 line-through decoration-slate-300">{c.name}</span>
                      <span className="text-xs text-slate-400">{usage.get(c.id) ?? 0} contas</span>
                      <Button variant="outline" size="sm" onClick={() => save(c.id, { active: true }, `"${c.name}" reativada.`)}>
                        Reativar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------ cards Empresa / Pessoal */}
        {splitPayables && (
          <div className="flex min-w-0 flex-col gap-4">
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
                    "min-h-[120px] rounded-xl border-2 border-dashed p-4 transition-colors",
                    overZone === s ? SCOPE[s].over : SCOPE[s].box,
                  )}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={cn("text-sm font-semibold", s === "EMPRESA" ? "text-primary" : "text-violet-700")}>
                      {SCOPE[s].label}
                    </h3>
                    <span className="text-xs text-slate-500">{inZone.length}</span>
                  </div>
                  {inZone.length === 0 ? (
                    <p className="text-xs text-slate-500">Arraste categorias para cá.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {inZone.map((c) => (
                        <span
                          key={c.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, c.id, s)}
                          className={cn(
                            "inline-flex cursor-grab items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-xs font-medium active:cursor-grabbing",
                            SCOPE[s].chip,
                          )}
                        >
                          {c.name}
                          <button
                            type="button"
                            onClick={() => save(c.id, { [SCOPE[s].flag]: false })}
                            className="rounded-full p-0.5 hover:bg-slate-100"
                            aria-label={`Tirar ${c.name} de ${SCOPE[s].label}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            <p className="text-xs text-slate-500">
              Da lista para um card: adiciona. De um card para o outro: move. O × tira a categoria do card.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
