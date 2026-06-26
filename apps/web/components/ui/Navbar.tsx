"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Search,
  Sparkles,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Playbooks", href: "/playbooks", icon: BookOpen },
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

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notifications"
          className="relative text-text-secondary transition-colors hover:text-text-primary"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-primary" />
        </button>
        <button
          type="button"
          aria-label="Search"
          className="text-text-secondary transition-colors hover:text-text-primary"
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-bg-elevated"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-[11px] font-bold text-white">
            JD
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-medium text-text-primary">
              Jamie Dawson
            </span>
            <span className="block text-[11px] text-text-secondary">
              Growth Team
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-text-secondary" />
        </button>
      </div>
    </header>
  );
}
