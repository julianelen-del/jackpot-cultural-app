import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import sharp from "sharp";
import {
  CountryEditionSchema,
  type Continent,
  type CountryEdition,
  type CountrySourceConfig,
} from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const AUDIO_ASSETS_DIR = path.join(process.cwd(), "public", "audio");
const PODCAST_DIR = path.join(process.cwd(), "public", "podcast");
const EPISODES_JSON_PATH = path.join(PODCAST_DIR, "episodes.json");
const PODCAST_XML_PATH = path.join(process.cwd(), "public", "podcast.xml");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const COVER_PATH = path.join(process.cwd(), "public", "podcast-cover.png");

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://jackpot-cultural-app.vercel.app"
).replace(/\/+$/, "");

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const MALE_VOICE_NAME = process.env.PODCAST_VOICE || "Charon";
const FEMALE_VOICE_NAME = process.env.PODCAST_FEMALE_VOICE || "Aoede";
const PODCAST_EMAIL = (process.env.PODCAST_EMAIL || "").trim();
const MAX_EPISODES_KEPT = 12;

interface EpisodeMeta {
  id: string;
  week: string;
  title: string;
  description: string;
  pubDate: string;
  fileName: string;
  bytes: number;
  durationSec: number;
  countries: string[];
}

const ORDINAL_TENS_M: Record<number, string> = {
  10: "décimo",
  20: "vigésimo",
  30: "trigésimo",
  40: "cuadragésimo",
  50: "quincuagésimo",
  60: "sexagésimo",
  70: "septuagésimo",
  80: "octogésimo",
  90: "nonagésimo",
};

const ORDINAL_TENS_F: Record<number, string> = {
  10: "décima",
  20: "vigésima",
  30: "trigésima",
  40: "cuadragésima",
  50: "quincuagésima",
  60: "sexagésima",
  70: "septuagésima",
  80: "octogésima",
  90: "nonagésima",
};

const ORDINAL_UNITS_M: Record<number, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  5: "quinto",
  6: "sexto",
  7: "séptimo",
  8: "octavo",
  9: "noveno",
};

const ORDINAL_UNITS_F: Record<number, string> = {
  1: "primera",
  2: "segunda",
  3: "tercera",
  4: "cuarta",
  5: "quinta",
  6: "sexta",
  7: "séptima",
  8: "octava",
  9: "novena",
};

function toSpanishOrdinal(num: number, feminine: boolean): string | null {
  if (num < 1 || num > 99) return null;
  const tens = Math.floor(num / 10) * 10;
  const unit = num % 10;
  const tMap = feminine ? ORDINAL_TENS_F : ORDINAL_TENS_M;
  const uMap = feminine ? ORDINAL_UNITS_F : ORDINAL_UNITS_M;
  if (tens === 0) return uMap[unit] || null;
  if (unit === 0) return tMap[tens] || null;
  return `${tMap[tens]} ${uMap[unit]}`;
}

function normalizeEditionOrdinals(text: string): string {
  const femNouns =
    "Semana|Edición|Feria|Bienal|Muestra|Temporada|Entrega|Gala|Maratón";
  const mascNouns = "Festival|Encuentro|Congreso|Premio|Salón|Ciclo|Certamen";

  let out = text.replace(
    new RegExp(`\\b(\\d{1,2})\\s*[°.ºª]?\\s+(${femNouns})\\b`, "g"),
    (full, nStr: string, noun: string) => {
      const ord = toSpanishOrdinal(Number(nStr), true);
      return ord ? `${ord} ${noun}` : full;
    }
  );

  out = out.replace(
    new RegExp(`\\b(\\d{1,2})\\s*[°.ºª]?\\s+(${mascNouns})\\b`, "g"),
    (full, nStr: string, noun: string) => {
      const ord = toSpanishOrdinal(Number(nStr), false);
      return ord ? `${ord} ${noun}` : full;
    }
  );

  return out;
}

function runFfmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
}

function cleanSpeechText(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeEditionOrdinals(plain);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getAudioDurationSec(filePath: string): number {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf-8" }
  ).trim();
  const val = Number.parseFloat(out);
  return Number.isFinite(val) ? val : 0;
}

function loadEditions(): CountryEdition[] {
  const configs = JSON.parse(
    fs.readFileSync(SOURCES_PATH, "utf-8")
  ) as CountrySourceConfig[];

  const editions: CountryEdition[] = [];
  for (const cfg of configs) {
    const filePath = path.join(COUNTRIES_DIR, `${cfg.slug}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const parsed = CountryEditionSchema.safeParse(raw);
      if (parsed.success) editions.push(parsed.data);
    } catch {
      // Ignorar archivo corrupto
    }
  }
  return editions;
}

function pickLatestWeek(editions: CountryEdition[]): string {
  const counts = new Map<string, number>();
  for (const ed of editions) {
    counts.set(ed.edition_week, (counts.get(ed.edition_week) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );
  return sorted[0]?.[0] || "2026-W01";
}

function selectFeaturedEditions(
  editions: CountryEdition[],
  latestWeek: string,
  requestedSlugs: string[]
): CountryEdition[] {
  if (requestedSlugs.length > 0) {
    return requestedSlugs
      .map((s) => editions.find((e) => e.slug === s))
      .filter((e): e is CountryEdition => Boolean(e));
  }

  const weekEditions = editions.filter((e) => e.edition_week === latestWeek);
  const pool = weekEditions.length >= 4 ? weekEditions : editions;

  const weekNumMatch = latestWeek.match(/W(\d+)/);
  const weekNum = weekNumMatch ? Number(weekNumMatch[1]) : 1;

  const continentOrder: Continent[] = [
    "América",
    "Europa",
    "Asia",
    "África",
    "Oceanía",
  ];
  const selected: CountryEdition[] = [];

  for (const cont of continentOrder) {
    if (selected.length >= 4) break;
    const inCont = pool.filter((e) => e.continent === cont);
    if (inCont.length > 0) {
      const picked = inCont[weekNum % inCont.length];
      if (!selected.some((s) => s.slug === picked.slug)) {
        selected.push(picked);
      }
    }
  }

  return selected.slice(0, 4);
}

async function synthesizeSegmentToWav(
  ai: GoogleGenAI,
  speechText: string,
  voiceName: string,
  styleRole: "female-host" | "male-host",
  outWavPath: string,
  tmpDir: string,
  idx: number
) {
  const styleLine =
    styleRole === "female-host"
      ? "Lee el siguiente guion en voz alta en español rioplatense neutro, con voz femenina cálida, clara y elegante de locutora de radio cultural:"
      : "Lee el siguiente guion en voz alta en español rioplatense neutro, con voz masculina sobria, cálida y periodística de conductor de radio cultural:";

  const prompt = `${styleLine}\n\n${speechText}`;

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: