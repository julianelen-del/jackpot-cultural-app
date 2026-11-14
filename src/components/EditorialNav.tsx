"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import type { Continent } from "@/lib/schema";
import type { CountrySummary } from "@/lib/countries";
import { CountrySelectorModal } from "./CountrySelectorModal";

interface EditorialNavProps {
  groupedCountries: {
    continent: Continent;
    countries: CountrySummary[];
  }[];
  currentSlug: string;
}

export function EditorialNav({
  groupedCountries,
  currentSlug,
}: EditorialNavProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-8">
          <Link
            href="/"
            className="font-serif text-lg font-semibold tracking-tight text-ink transition-colors hover:text-accent sm:text-xl"
          >
            JACKPOT CULTURAL
          </Link>

          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/?spin=1"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase transition-opacity hover:opacity-75"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Volver a tirar</span>
            </Link>

            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="cursor-pointer border-b border-ink/30 pb-0.5 text-[11px] font-medium tracking-[0.14em] text-ink-muted uppercase transition-colors hover:border-ink hover:text-ink"
            >
              Elegir país
            </button>
          </div>
        </div>
      </nav>

      <CountrySelectorModal
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        groupedCountries={groupedCountries}
        currentSlug={currentSlug}
      />
    </>
  );
}