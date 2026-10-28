import {
  ClipboardCheck,
  FileBarChart,
  FileSignature,
  HandCoins,
  Home,
  Receipt,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** só aparece quando a IA está configurada no servidor */
  requiresAi?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/contas-a-receber", label: "Contas a Receber", icon: HandCoins },
  { href: "/contas-a-pagar", label: "Contas a Pagar", icon: Receipt },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/tarefas", label: "Tarefas", icon: ClipboardCheck },
  { href: "/contratos", label: "Contratos", icon: FileSignature },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/assistente", label: "Assistente IA", icon: Sparkles, requiresAi: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
