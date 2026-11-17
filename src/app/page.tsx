import { getAllCountrySummaries, getCountriesGroupedByContinent } from "@/lib/countries";
import { SlotMachine } from "@/components/SlotMachine";

export default function Home() {
  const countries = getAllCountrySummaries();
  const groupedCountries = getCountriesGroupedByContinent();

  return (
    <main className="min-h-dvh bg-paper">
      <SlotMachine countries={countries} groupedCountries={groupedCountries} />
    </main>
  );
}