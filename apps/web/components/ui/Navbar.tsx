"use client";

// Persistent top nav rendered by the root layout on every page. Only links
// to the three documented product screens (Dashboard/Playbooks/Query) —
// the "/sessions" and "/settings" stub routes are intentionally not listed
// here. There is no auth, notifications, or search in the backend, so none
// of that chrome is rendered.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, Sparkles, Terminal } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Playbooks", href: "/playbooks", icon: BookOpen },
  { label: "Query", href: "/query", icon: Terminal },
] as const;

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="fixed left-0 top-0 z-50 flex h-[52px] w-full items-center justify-between border-b border-border-subtle bg-bg-base px-5">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sparkles className="h-[18px] w-[18px] text-accent-primary" />
          <span className="text-[15px] font-bold text-text-primary">ARAP</span>
          <span className="-ml-1 self-start pt-0.5 text-[11px] font-semibold text-text-accent">
            v2.4
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-bg-elevated text-text-primary"
                    : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
