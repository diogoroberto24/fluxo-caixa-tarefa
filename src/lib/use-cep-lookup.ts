"use client";

import { useEffect, useRef, useState } from "react";
import { lookupCepAction } from "@/app/(app)/clientes/actions";
import { onlyDigits } from "@/lib/validators";

export type CepFields = "street" | "district" | "city" | "state";
export type CepStatus = "idle" | "loading" | "ok" | "partial" | "notfound" | "error";

const HINT: Record<CepStatus, string | undefined> = {
  idle: undefined,
  loading: "Buscando endereço…",
  ok: "Endereço preenchido. Confira e informe o número.",
  partial: "CEP geral da cidade: preencha rua e bairro.",
  notfound: "CEP não encontrado. Preencha o endereço manualmente.",
  error: "Consulta de CEP indisponível. Preencha manualmente.",
};

/**
 * Ao completar os 8 dígitos do CEP, busca o endereço e preenche rua, bairro, cidade e UF.
 * Nunca sobrescreve o que o usuário digitou: só preenche campo vazio ou preenchido por uma busca anterior.
 */
export function useCepLookup(opts: {
  zip: string;
  /** CEP já salvo (edição): não busca ao abrir. */
  initialZip?: string;
  /** Valores que contam como "não digitados pelo usuário" (ex.: UF padrão). */
  initialAuto?: Partial<Record<CepFields, string>>;
  getValue: (f: CepFields) => string | undefined;
  setValue: (f: CepFields, v: string) => void;
  focus: (f: CepFields | "number") => void;
}): { status: CepStatus; hint: string | undefined } {
  const digits = onlyDigits(opts.zip ?? "");
  const [status, setStatus] = useState<CepStatus>("idle");
  const last = useRef(opts.initialZip ? onlyDigits(opts.initialZip) : "");
  const auto = useRef<Partial<Record<CepFields, string>>>(opts.initialAuto ?? {});
  const fns = useRef(opts);
  fns.current = opts;

  useEffect(() => {
    if (digits.length !== 8) {
      setStatus("idle");
      return;
    }
    if (digits === last.current) return;
    last.current = digits;
    let cancelled = false;
    setStatus("loading");
    lookupCepAction(digits).then((r) => {
      if (cancelled) return;
      if (!r.ok) return setStatus("error");
      if (!r.data) return setStatus("notfound");
      const { getValue, setValue, focus } = fns.current;
      for (const f of ["street", "district", "city", "state"] as const) {
        const value = r.data[f];
        const current = getValue(f);
        if (value && (!current || current === auto.current[f])) {
          setValue(f, value);
          auto.current[f] = value;
        }
      }
      setStatus(r.data.street ? "ok" : "partial");
      focus(r.data.street ? "number" : "street");
    });
    return () => {
      cancelled = true;
    };
  }, [digits]);

  return { status, hint: HINT[status] };
}
