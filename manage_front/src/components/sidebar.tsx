"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Server,
  BarChart3,
  ScrollText,
  Brain,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/users", label: "Gestion des utilisateurs", icon: Users },
  { href: "/containers", label: "Gestion des conteneurs", icon: Server },
  { href: "/models", label: "Configuration des modèles", icon: Brain },
  { href: "/usage", label: "Statistiques d'utilisation", icon: BarChart3 },
  { href: "/audit", label: "Journal d'audit", icon: ScrollText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-white min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold">OpenClaw Admin</h1>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-gray-100 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
