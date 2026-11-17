import {
  CONTINENTS,
  CountryEditionSchema,
  type Continent,
  type CountryEdition,
  type CountryListeningConfig,
  type CountrySourceConfig,
} from "./schema";

import fs from "node:fs";
import path from "node:path";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");

export interface CountrySummary {
  slug: string;
  country: string;
  continent: Continent;
  flag: string;
  listening?: CountryListeningConfig;
}

export function getAllCountrySummaries(): CountrySummary[] {
  try {
    if (!fs.existsSync(SOURCES_PATH)) return [];
    const raw = fs.readFileSync(SOURCES_PATH, "utf-8");
    const configs = JSON.parse(raw) as CountrySourceConfig[];
    return configs.map((c) => ({
      slug: c.slug,
      country: c.country,
      continent: c.continent,
      flag: c.flag,
      ...(c.listening ? { listening: c.listening } : {}),
    }));
  } catch {
    return [];
  }
}

export function getCountriesGroupedByContinent(): {
  continent: Continent;
  countries: CountrySummary[];
}[] {
  const all = getAllCountrySummaries();
  return CONTINENTS.map((continent) => ({
    continent,
    countries: all.filter((c) => c.continent === continent),
  }));
}

export function getCountryConfigBySlug(
  slug: string
): CountrySummary | undefined {
  return getAllCountrySummaries().find((c) => c.slug === slug);
}

export function getCountryEdition(slug: string): CountryEdition | null {
  try {
    const filePath = path.join(COUNTRIES_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = CountryEditionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}