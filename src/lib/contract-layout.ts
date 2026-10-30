/** Divide o texto de um contrato emitido em blocos para a diagramação (título, cláusulas, itens, assinaturas). O texto em si não muda. */
export type ContractBlock =
  | { kind: "clausula" | "area" | "paragrafo" | "texto" | "data"; text: string }
  | { kind: "item"; number: string; text: string };

export type ContractSignature = { role: string; lines: string[] };

export type ContractLayout = { title: string; blocks: ContractBlock[]; signatures: ContractSignature[] };

const DATE_LINE = /^[^\n]*\d{2}\/\d{2}\/\d{4}\.$/;

export function layoutContract(body: string): ContractLayout {
  const lines = body.replace(/\r/g, "").split("\n").map((l) => l.trim());
  let i = 0;
  while (i < lines.length && !lines[i]) i++;
  const title = lines[i] ?? "";
  i++;

  const sigStart = lines.findIndex((l, idx) => idx >= i && /^_{10,}$/.test(l));
  const end = sigStart < 0 ? lines.length : sigStart;

  const blocks: ContractBlock[] = [];
  for (const l of lines.slice(i, end)) {
    if (!l) continue;
    const item = l.match(/^(\d+\.\d+) (.*)$/);
    if (/^CLÁUSULA /.test(l)) blocks.push({ kind: "clausula", text: l });
    else if (/^Parágrafo .*\.$/.test(l)) blocks.push({ kind: "paragrafo", text: l });
    else if (/^\d+\. \S/.test(l)) blocks.push({ kind: "area", text: l });
    else if (item) blocks.push({ kind: "item", number: item[1], text: item[2] });
    else if (DATE_LINE.test(l) && l.length < 80) blocks.push({ kind: "data", text: l });
    else blocks.push({ kind: "texto", text: l });
  }

  const signatures: ContractSignature[] = [];
  if (sigStart >= 0) {
    let cur: ContractSignature | null = null;
    for (const l of lines.slice(sigStart)) {
      if (/^_{10,}$/.test(l)) {
        cur = { role: "", lines: [] };
        signatures.push(cur);
      } else if (l && cur) {
        if (!cur.role) cur.role = l;
        else cur.lines.push(l);
      }
    }
  }
  return { title, blocks, signatures };
}
