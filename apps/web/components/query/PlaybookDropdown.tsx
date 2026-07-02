"use client";

// Playbook-scope selector for the Query screen's header. A custom
// dropdown (not a native <select>) so it can be styled to match the rest
// of the UI; closes on outside click or Escape.
import { BookOpen, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PlaybookDropdownProps {
  activePlaybook: string;
  onSelect: (playbook: string) => void;
}

// Fixture option list — stands in for playbook titles that would come from
// GET /api/v1/documents; selecting one doesn't currently scope the (also
// fixture) query response to that playbook.
const PLAYBOOK_OPTIONS = [
  "All Playbooks",
  "Enterprise SaaS",
  "Fintech Growth",
  "AI Infrastructure",
  "Developer Tools",
  "Product-Led Growth",
  "Competitive Battlecards",
];

export function PlaybookDropdown({ activePlaybook, onSelect }: PlaybookDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global listeners (rather than a blur handler) so clicking anywhere
  // outside the dropdown — including on other page elements — closes it,
  // and Escape closes it regardless of focus.
  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-w-[160px] items-center gap-2 rounded-md border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary transition-colors ${
          open ? "border-accent-primary" : "border-border-active"
        }`}
      >
        <BookOpen className="h-3.5 w-3.5 text-accent-primary" />
        <span>{activePlaybook}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-text-secondary" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-1 w-[220px] rounded-lg border border-border-active bg-bg-surface py-1 shadow-xl">
          {PLAYBOOK_OPTIONS.map((option) => {
            const isActive = option === activePlaybook;
            return (
              <div
                key={option}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className={`cursor-pointer px-4 py-2.5 text-sm transition-colors hover:bg-bg-elevated ${
                  isActive
                    ? "bg-bg-elevated font-medium text-accent-primary"
                    : "text-text-primary"
                }`}
              >
                {option}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
