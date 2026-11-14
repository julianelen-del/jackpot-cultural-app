import { Suspense } from "react";
import {
  getAllCountrySummaries,
  getCountriesGroupedByContinent,
} from "@/lib/countries";
import { SlotMachine } from "@/components/SlotMachine";

export default function HomePage() {
  const countries = getAllCountrySummaries();
  const groupedCountries = getCountriesGroupedByContinent();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-paper font-serif text-lg text-ink-muted">
          Cargando JACKPOT CULTURAL...
        </div>
      }
    >
      <SlotMachine
        countries={countries}
        groupedCountries={groupedCountries}
      />
    </Suspense>
  );
}