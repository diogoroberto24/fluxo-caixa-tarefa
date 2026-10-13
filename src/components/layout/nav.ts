import {
  ClipboardCheck,
  FileBarChart,
  HandCoins,
  Home,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/contas-a-receber", label: "Contas a Receber", icon: HandCoins },
  { href: "/contas-a-pagar", label: "Contas a Pagar", icon: Receipt },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/tarefas", label: "Tarefas", icon: ClipboardCheck },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
