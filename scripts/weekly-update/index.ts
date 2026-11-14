import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import type { CountryEdition, CountrySourceConfig } from "../../src/lib/schema";
import { generateCountryEdition } from "./generate-edition";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPreviousTopics(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CountryEdition>;
    return (parsed.topics || []).map((t) => t.title).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: Falta la variable de entorno GEMINI_API_KEY.");
    process.exit(1);
  }

  fs.mkdirSync(COUNTRIES_DIR, { recursive: true });

  const sourcesRaw = fs.readFileSync(SOURCES_PATH, "utf-8");
  const allCountries = JSON.parse(sourcesRaw) as CountrySourceConfig[];

  const countryArg = process.argv.find((arg) => arg.startsWith("--country="));
  const filterSlug = countryArg?.split("=")[1]?.trim().toLowerCase();

  const targets = filterSlug
    ? allCountries.filter((c) => c.slug === filterSlug)
    : allCountries;

  if (!targets.length) {
    console.error(`No se encontró ningún país con slug "${filterSlug}".`);
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  let updatedCount = 0;
  const failures: string[] = [];

  console.log(`\n=== JACKPOT CULTURAL: Actualización de ${targets.length} país(es) ===\n`);

  for (let i = 0; i < targets.length; i++) {
    const country = targets[i];
    const outFile = path.join(COUNTRIES_DIR, `${country.slug}.json`);
    const previousTopics = getPreviousTopics(outFile);

    console.log(`[${i + 1}/${targets.length}] Procesando ${country.flag} ${country.country}...`);

    try {
      const edition = await generateCountryEdition(ai, country, previousTopics);
      fs.writeFileSync(outFile, JSON.stringify(edition, null, 2) + "\n", "utf-8");
      updatedCount++;
      console.log(`  ✓ ${country.country} actualizado (${edition.topics.length} temas, ${edition.sources.length} fuentes).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${country.country}: ${message}`);
      console.error(`  ✗ Error en ${country.country} (se conserva edición anterior): ${message}`);
    }

    if (i < targets.length - 1) {
      await sleep(2500);
    }
  }

  console.log(`\n=== Resumen: ${updatedCount}/${targets.length} actualizados ===`);
  if (failures.length > 0) {
    console.warn("Países con fallback a edición previa:\n- " + failures.join("\n- "));
  }

  if (updatedCount === 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();