"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { Continent } from "@/lib/schema";
import type { CountrySummary } from "@/lib/countries";

interface CountrySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedCountries: {
    continent: Continent;
    countries: CountrySummary[];
  }[];
  currentSlug?: string;
}

export function CountrySelectorModal({
  isOpen,
  onClose,
  groupedCountries,
  currentSlug,
}: CountrySelectorModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir país"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85dvh] w-full max-w-2xl overflow-y-auto border border-ink/20 bg-paper p-6 shadow-2xl sm:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-baseline justify-between border-b border-hairline pb-4">
          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-ink-muted uppercase">
              Índice de ediciones
            </p>
            <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              Elegir país
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector"
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-7 sm:grid-cols-2">
          {groupedCountries.map(({ continent, countries }) => (
            <div key={continent}>
              <h3 className="mb-3 border-b border-hairline pb-1.5 text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
                {continent}
              </h3>
              <ul className="space-y-1.5">
                {countries.map((c) => {
                  const isCurrent = c.slug === currentSlug;
                  return (
                    <li key={c.slug}>
                      <Link
                        href={`/pais/${c.slug}`}
                        onClick={onClose}
                        className={`flex items-center gap-2.5 py-1 text-base transition-colors ${
                          isCurrent
                            ? "font-semibold text-accent"
                            : "text-ink hover:text-accent"
                        }`}
                      >
                        <span className="text-lg leading-none" aria-hidden="true">
                          {c.flag}
                        </span>
                        <span className="font-serif text-[17px]">{c.country}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}