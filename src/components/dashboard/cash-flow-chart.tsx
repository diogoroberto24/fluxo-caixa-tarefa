"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/components/providers/app-store";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { monthOf } from "@/lib/dates";
import { formatBRL, monthLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { cashFlowByMonth } from "@/services/finance";

const MONTHS = 6;
// Cores das séries (paleta categórica validada para daltonismo); texto sempre nas cores de texto.
const IN_COLOR = "#2a78d6";
const OUT_COLOR = "#eb6834";

const H = 260;
const PAD = { left: 64, right: 8, top: 10, bottom: 28 };

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const shortMonth = (ym: string) => SHORT[Number(ym.slice(5, 7)) - 1];

/** Escala "redonda": passo 1/2/5 × 10^n com no máximo 5 divisões. */
function niceScale(maxReais: number) {
  if (maxReais <= 0) return { step: 1, ticks: 4 };
  let step = 1;
  for (let p = 10 ** Math.floor(Math.log10(maxReais / 5)); ; p *= 10) {
    const s = [1, 2, 5].map((m) => m * p).find((c) => Math.ceil(maxReais / c) <= 5);
    if (s) { step = s; break; }
  }
  return { step, ticks: Math.ceil(maxReais / step) };
}

function axisLabel(reais: number) {
  return reais >= 1000 ? `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${reais}`;
}

function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Fluxo de caixa realizado: recebido x pago por mês, nos últimos 6 meses (o atual até hoje). */
export function CashFlowChart() {
  const { receivables, payables, today, currentUser } = useAppStore();
  const showIn = can(currentUser.role, "receivable:read");
  const showOut = can(currentUser.role, "payable:read");
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // O desenho usa a largura real do card (texto sempre em tamanho legível, também no celular).
  const [W, setW] = useState(600);
  const currentMonth = monthOf(today);

  const rows = useMemo(
    () => cashFlowByMonth(showIn ? receivables : [], showOut ? payables : [], currentMonth, MONTHS),
    [receivables, payables, currentMonth, showIn, showOut],
  );

  // O plot só existe quando há dados: reavalia quando os dados mudam.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  if (!showIn && !showOut) return null;

  const series = [
    ...(showIn ? [{ name: "Recebido", color: IN_COLOR, value: (i: number) => rows[i].receivedCents }] : []),
    ...(showOut ? [{ name: "Pago", color: OUT_COLOR, value: (i: number) => rows[i].paidCents }] : []),
  ];
  const maxCents = Math.max(0, ...rows.flatMap((_, i) => series.map((s) => s.value(i))));
  const empty = maxCents === 0;
  const { step, ticks } = niceScale(maxCents / 100);
  const top = step * ticks * 100;
  const plotH = H - PAD.top - PAD.bottom;
  const colW = (W - PAD.left - PAD.right) / rows.length;
  const y = (cents: number) => PAD.top + plotH - (plotH * cents) / top;
  const gap = 2;
  const barW = Math.min(26, (colW * 0.62 - gap * (series.length - 1)) / series.length);

  const hovered = hover === null ? null : rows[hover];

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1">
        <CardTitle className="text-[16px]">
          <BarChart3 className="h-5 w-5 text-navy" strokeWidth={1.8} /> Fluxo de caixa dos últimos {MONTHS} meses
        </CardTitle>
      </CardHeader>
      <div className="grid gap-3 px-5 pb-5 pt-1">
        <p className="text-xs text-slate-500">
          {showIn && showOut
            ? "Quanto entrou (recebimentos) e quanto saiu (contas pagas) em cada mês."
            : showIn
              ? "Quanto foi recebido em cada mês."
              : "Quanto foi pago em cada mês."}{" "}
          {monthLabel(currentMonth)} conta até hoje.
        </p>

        {series.length > 1 && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            {series.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}

        {empty ? (
          <p className="rounded-lg bg-surface px-4 py-10 text-center text-sm text-slate-500">
            Ainda não há pagamentos registrados nos últimos {MONTHS} meses.
          </p>
        ) : (
          <div ref={plotRef} className="relative" onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full overflow-visible" role="img" aria-label={`Fluxo de caixa dos últimos ${MONTHS} meses`}>
              {Array.from({ length: ticks + 1 }, (_, t) => {
                const cents = (top * t) / ticks;
                return (
                  <g key={t}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(cents)} y2={y(cents)} stroke="#e3e8ef" strokeWidth={t === 0 ? 1.2 : 1} />
                    <text x={PAD.left - 8} y={y(cents) + 4} textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                      {axisLabel((step * t))}
                    </text>
                  </g>
                );
              })}
              {rows.map((r, i) => {
                const x0 = PAD.left + colW * i;
                const gx = x0 + (colW - (barW * series.length + gap * (series.length - 1))) / 2;
                return (
                  <g key={r.month}>
                    {hover === i && <rect x={x0} y={PAD.top} width={colW} height={plotH} fill="rgba(15,37,71,.04)" />}
                    {series.map((s, j) => {
                      const v = s.value(i);
                      return <path key={s.name} d={barPath(gx + j * (barW + gap), y(v), barW, y(0) - y(v))} fill={s.color} />;
                    })}
                    <text x={x0 + colW / 2} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                      {shortMonth(r.month)}{r.month === currentMonth ? "*" : ""}
                    </text>
                    <rect
                      x={x0}
                      y={PAD.top}
                      width={colW}
                      height={plotH}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                    />
                  </g>
                );
              })}
            </svg>

            {hovered && hover !== null && (
              <div
                className={cn(
                  "pointer-events-none absolute z-10 min-w-[170px] -translate-y-full whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg",
                  // nas pontas o balão abre para dentro, para não sair do card
                  hover === 0 ? "translate-x-0" : hover === rows.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{
                  left: PAD.left + colW * hover + (hover === 0 ? 0 : hover === rows.length - 1 ? colW : colW / 2),
                  top: y(Math.max(...series.map((s) => s.value(hover)))) - 10,
                }}
              >
                <div className="mb-1 font-semibold text-navy">
                  {monthLabel(hovered.month)}{hovered.month === currentMonth ? " (até hoje)" : ""}
                </div>
                {series.map((s) => (
                  <div key={s.name} className="flex justify-between gap-4 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span>{formatBRL(s.value(hover))}</span>
                  </div>
                ))}
                {series.length > 1 && (
                  <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold tabular-nums">
                    <span>Saldo</span>
                    <span>{formatBRL(hovered.receivedCents - hovered.paidCents)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-primary hover:underline">Ver os números em tabela</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="py-1.5 pr-2 text-left font-medium">Mês</th>
                  {series.map((s) => <th key={s.name} className="px-2 py-1.5 text-right font-medium">{s.name}</th>)}
                  {series.length > 1 && <th className="py-1.5 pl-2 text-right font-medium">Saldo</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.month} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2">{monthLabel(r.month)}</td>
                    {series.map((s) => <td key={s.name} className="px-2 py-1.5 text-right">{formatBRL(s.value(i))}</td>)}
                    {series.length > 1 && <td className="py-1.5 pl-2 text-right font-medium">{formatBRL(r.receivedCents - r.paidCents)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </Card>
  );
}
