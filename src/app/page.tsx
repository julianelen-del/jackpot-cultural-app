import { Suspense } from "react";
import {
  getAllCountrySummaries,
  getCountriesGroupedByContinent,
} from "@/lib/countries";
import { SlotMachine } from "@/components/SlotMachine";

export default function Home() {
  const countries = getAllCountrySummaries();
  const groupedCountries = getCountriesGroupedByContinent();

  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-paper">
          <p className="text-xs tracking-[0.2em] text-ink-muted uppercase">
            Cargando...
          </p>
        </main>
      }
    >
      <SlotMachine
        countries={countries}
        groupedCountries={groupedCountries}
      />
    </Suspense>
  );
}