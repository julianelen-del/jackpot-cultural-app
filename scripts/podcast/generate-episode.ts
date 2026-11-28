import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import satori from "satori";
import sharp from "sharp";
import { CountryEditionSchema, type Continent, type CountryEdition, type CountrySourceConfig } from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const AUDIO_ASSETS_DIR = path.join(process.cwd(), "public", "audio");
const PODCAST_DIR = path.join(process.cwd(), "public", "podcast");
const CARDS_DIR = path.join(process.cwd(), "public", "social-cards");
const EPISODES_JSON_PATH = path.join(PODCAST_DIR, "episodes.json");
const PODCAST_XML_PATH = path.join(process.cwd(), "public", "podcast.xml");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const COVER_PATH = path.join(process.cwd(), "public", "podcast-cover.png");
const CACHED_CLOSING_PATH = path.join(AUDIO_ASSETS_DIR, "cierre-voz.mp3");
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://jackpot-cultural-app.vercel.app").replace(/\/+$/, "");

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const MALE_VOICE_NAME = process.env.PODCAST_VOICE || "Charon";
const FEMALE_VOICE_NAME = process.env.PODCAST_FEMALE_VOICE || "Aoede";
const PODCAST_EMAIL = (process.env.PODCAST_EMAIL || "").trim();
const MAX_EPISODES_KEPT = 14;

const FEATURED_SINGLE_SLUGS = ["argentina", "brasil", "estados-unidos", "francia", "reino-unido", "alemania"];

export interface EpisodeMeta {
  id: string;
  key: string;
  week: string;
  title: string;
  subtitle: string;
  description: string;
  pubDate: string;
  fileName: string;
  cardFileName: string;
  bytes: number;
  durationSec: number;
  countries: string[];
  headlines: string[];
}

interface FontAsset {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

const TENS_M: Record<number, string> = { 10: "décimo", 20: "vigésimo", 30: "trigésimo", 40: "cuadragésimo", 50: "quincuagésimo", 60: "sexagésimo", 70: "septuagésimo", 80: "octogésimo", 90: "nonagésimo" };
const TENS_F: Record<number, string> = { 10: "décima", 20: "vigésima", 30: "trigésima", 40: "cuadragésima", 50: "quincuagésima", 60: "sexagésima", 70: "septuagésima", 80: "octogésima", 90: "nonagésima" };
const UNITS_M: Record<number, string> = { 1: "primer", 2: "segundo", 3: "tercer", 4: "cuarto", 5: "quinto", 6: "sexto", 7: "séptimo", 8: "octavo", 9: "noveno" };
const UNITS_F: Record<number, string> = { 1: "primera", 2: "segunda", 3: "tercera", 4: "cuarta", 5: "quinta", 6: "sexta", 7: "séptima", 8: "octava", 9: "novena" };

function toSpanishOrdinal(num: number, feminine: boolean): string | null {
  if (num < 1 || num > 99) return null;
  const tens = Math.floor(num / 10) * 10;
  const unit = num % 10;
  const tMap = feminine ? TENS_F : TENS_M;
  const uMap = feminine ? UNITS_F : UNITS_M;
  if (tens === 0) return uMap[unit] || null;
  if (unit === 0) return tMap[tens] || null;
  return `${tMap[tens]} ${uMap[unit]}`;
}

function normalizeEditionOrdinals(text: string): string {
  const fem = "Semana|Edición|Feria|Bienal|Muestra|Temporada|Entrega|Gala|Maratón";
  const masc = "Festival|Encuentro|Congreso|Premio|Salón|Ciclo|Certamen";
  let out = text.replace(new RegExp(`\\b(\\d{1,2})\\s*[°.ºª]?\\s+(${fem})\\b`, "g"), (full, n: string, noun: string) => {
    const ord = toSpanishOrdinal(Number(n), true);
    return ord ? `${ord} ${noun}` : full;
  });
  out = out.replace(new RegExp(`\\b(\\d{1,2})\\s*[°.ºª]?\\s+(${masc})\\b`, "g"), (full, n: string, noun: string) => {
    const ord = toSpanishOrdinal(Number(n), false);
    return ord ? `${ord} ${noun}` : full;
  });
  return out;
}

function runFfmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function cleanPlainText(text: string): string {
  return text
    .replace(/\\r\\n/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSpeechText(text: string): string {
  return normalizeEditionOrdinals(cleanPlainText(text));
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}…`;
}

function fitCompleteSentences(text: string, maxLen: number): string {
  const clean = cleanPlainText(text);
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    let acc = "";
    for (const rawSentence of sentences) {
      const s = rawSentence.trim();
      const candidate = acc ? `${acc} ${s}` : s;
      if (candidate.length <= maxLen) acc = candidate;
      else break;
    }
    if (acc) return acc;
  }
  return truncateText(clean, maxLen);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getAudioDurationSec(filePath: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { encoding: "utf-8" }).trim();
  const val = Number.parseFloat(out);
  return Number.isFinite(val) ? val : 0;
}

function loadEditions(): CountryEdition[] {
  const configs = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf-8")) as CountrySourceConfig[];
  const editions: CountryEdition[] = [];
  for (const cfg of configs) {
    const filePath = path.join(COUNTRIES_DIR, `${cfg.slug}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = CountryEditionSchema.safeParse(JSON.parse(fs.readFileSync(filePath, "utf-8")));
      if (parsed.success) editions.push(parsed.data);
    } catch {
      // Ignorar archivo corrupto
    }
  }
  return editions;
}

function pickLatestWeek(editions: CountryEdition[]): string {
  const counts = new Map<string, number>();
  for (const ed of editions) counts.set(ed.edition_week, (counts.get(ed.edition_week) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[0].localeCompare(a[0]))[0]?.[0] || "2026-W01";
}

function resolveEditionKeyFromArgentinaDay(): string {
  const argDay = new Date(Date.now() - 3 * 3600 * 1000).getUTCDay();
  const map: Record<number, string> = {
    1: "argentina",
    2: "brasil",
    3: "estados-unidos",
    4: "francia",
    5: "reino-unido",
    6: "alemania",
    0: "resto-del-mundo",
  };
  return map[argDay] || "argentina";
}

function selectEditionCountries(editions: CountryEdition[], latestWeek: string, editionKey: string): { selected: CountryEdition[]; label: string; isWorldRoundup: boolean } {
  if (editionKey === "resto-del-mundo") {
    const restPool = editions.filter((e) => !FEATURED_SINGLE_SLUGS.includes(e.slug));
    const weekPool = restPool.filter((e) => e.edition_week === latestWeek);
    const source = weekPool.length >= 3 ? weekPool : restPool;
    const weekNumMatch = latestWeek.match(/W(\d+)/);
    const weekNum = weekNumMatch ? Number(weekNumMatch[1]) : 1;
    const startIdx = ((weekNum - 1) * 3) % Math.max(1, source.length);
    const picked: CountryEdition[] = [];
    for (let i = 0; i < source.length && picked.length < 3; i++) {
      picked.push(source[(startIdx + i) % source.length]);
    }
    return { selected: picked, label: "Resto del mundo", isWorldRoundup: true };
  }

  const single = editions.find((e) => e.slug === editionKey);
  if (single) return { selected: [single], label: single.country, isWorldRoundup: false };

  return { selected: editions.slice(0, 1), label: editions[0]?.country || "Mundo", isWorldRoundup: false };
}

async function synthesizeSegmentToWav(ai: GoogleGenAI, speechText: string, voiceName: string, styleRole: "female-host" | "male-host", outWavPath: string, tmpDir: string, idx: number) {
  const styleLine = styleRole === "female-host"
    ? "Lee el siguiente guion en voz alta en español rioplatense neutro, con voz femenina cálida, clara y elegante de locutora de radio cultural:"
    : "Lee el siguiente guion en voz alta en español rioplatense neutro, con voz masculina sobria, cálida y periodística de conductor de radio cultural:";
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `${styleLine}\n\n${speechText}` }] }],
    config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  });
  const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`El modelo de voz no devolvió audio en el tramo ${idx}.`);
  const pcmPath = path.join(tmpDir, `seg-${idx}.pcm`);
  fs.writeFileSync(pcmPath, Buffer.from(b64, "base64"));

  const filterChain = [
    "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-48dB:stop_periods=-1:stop_duration=0.85:stop_threshold=-48dB",
    "areverse",
    "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-48dB",
    "areverse",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
  ].join(",");

  runFfmpeg(["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcmPath, "-af", filterChain, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);

  const dur = getAudioDurationSec(outWavPath);
  console.log(`    ↳ Tramo ${idx} procesado (${formatDuration(dur)})`);
}

function concatWavs(wavs: string[], outWavPath: string, tmpDir: string, tag: string) {
  const listFile = path.join(tmpDir, `concat-${tag}.txt`);
  fs.writeFileSync(listFile, wavs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  runFfmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", outWavPath]);
}

function createSilenceWav(outWavPath: string, sec: number) {
  runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${sec}`, "-c:a", "pcm_s16le", outWavPath]);
}

function boostEffectWav(rawWavPath: string, outWavPath: string) {
  runFfmpeg([
    "-i", rawWavPath,
    "-af", "acompressor=threshold=-18dB:ratio=3:attack=5:release=90:makeup=7dB,alimiter=limit=0.9",
    "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath,
  ]);
}

function createElaborateIntroWav(outWavPath: string, tmpDir: string) {
  const parts: string[] = [];
  [440, 523.25, 622.25, 740, 880].forEach((freq, i) => {
    const p = path.join(tmpDir, `intro-clk-${i}.wav`);
    runFfmpeg([
      "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=0.065`,
      "-f", "lavfi", "-i", `sine=frequency=${freq * 2}:duration=0.065`,
      "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=out:st=0.01:d=0.055,volume=0.85",
      "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p,
    ]);
    const gap = path.join(tmpDir, `intro-gap-${i}.wav`);
    createSilenceWav(gap, i < 2 ? 0.13 : 0.08);
    parts.push(p, gap);
  });
  [{ f: 220.0, d: 0.24 }, { f: 261.63, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 440.0, d: 0.24 }, { f: 493.88, d: 1.45 }].forEach((n, i) => {
    const p = path.join(tmpDir, `intro-mel-${i}.wav`);
    runFfmpeg([
      "-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`,
      "-f", "lavfi", "-i", `sine=frequency=${(n.f * 2).toFixed(2)}:duration=${n.d}`,
      "-f", "lavfi", "-i", `sine=frequency=${(n.f * 3).toFixed(2)}:duration=${n.d}`,
      "-filter_complex", `[0:a][1:a][2:a]amix=inputs=3:weights=1 0.65 0.3:duration=longest:normalize=0,afade=t=in:st=0:d=0.025,afade=t=out:st=${(n.d * 0.4).toFixed(2)}:d=${(n.d * 0.6).toFixed(2)},lowpass=f=3200,aecho=0.8:0.75:90:0.32,volume=0.6`,
      "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p,
    ]);
    parts.push(p);
  });
  const rawIntro = path.join(tmpDir, "intro-raw.wav");
  concatWavs(parts, rawIntro, tmpDir, "intro");
  boostEffectWav(rawIntro, outWavPath);
}

function createElaborateOutroWav(outWavPath: string, tmpDir: string) {
  const parts: string[] = [];
  [{ f: 493.88, d: 0.24 }, { f: 392.0, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 220.0, d: 1.9 }].forEach((n, i) => {
    const p = path.join(tmpDir, `outro-mel-${i}.wav`);
    runFfmpeg([
      "-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`,
      "-f", "lavfi", "-i", `sine=frequency=${(n.f * 2).toFixed(2)}:duration=${n.d}`,
      "-f", "lavfi", "-i", `sine=frequency=${(n.f * 1.5).toFixed(2)}:duration=${n.d}`,
      "-filter_complex", `[0:a][1:a][2:a]amix=inputs=3:weights=1 0.6 0.4:duration=longest:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=${(n.d * 0.35).toFixed(2)}:d=${(n.d * 0.65).toFixed(2)},lowpass=f=3000,aecho=0.8:0.78:100:0.32,volume=0.6`,
      "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p,
    ]);
    parts.push(p);
  });
  const endClick = path.join(tmpDir, "outro-clk.wav");
  createSyntheticChimeWav(endClick, "click", tmpDir);
  parts.push(endClick);
  const rawOutro = path.join(tmpDir, "outro-raw.wav");
  concatWavs(parts, rawOutro, tmpDir, "outro");
  boostEffectWav(rawOutro, outWavPath);
}

function createSyntheticChimeWav(outWavPath: string, kind: "sep" | "click", tmpDir: string) {
  if (kind === "click") {
    runFfmpeg([
      "-f", "lavfi", "-i", "sine=frequency=760:duration=0.09",
      "-f", "lavfi", "-i", "sine=frequency=1520:duration=0.09",
      "-filter_complex", "[0:a][1:a]amix=inputs=2:weights=1 0.7:duration=longest:normalize=0,afade=t=out:st=0.01:d=0.08,volume=0.95",
      "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath,
    ]);
    return;
  }
  const n1 = path.join(tmpDir, "sep-1.wav");
  const n2 = path.join(tmpDir, "sep-2.wav");
  runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=440:duration=0.22",
    "-f", "lavfi", "-i", "sine=frequency=880:duration=0.22",
    "-filter_complex", "[0:a][1:a]amix=inputs=2:weights=1 0.65:duration=longest:normalize=0,afade=t=in:st=0:d=0.015,afade=t=out:st=0.07:d=0.15,aecho=0.8:0.65:60:0.28,volume=0.72",
    "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n1,
  ]);
  runFfmpeg([
    "-f", "lavfi", "-i", "sine=frequency=587.33:duration=1.15",
    "-f", "lavfi", "-i", "sine=frequency=1174.66:duration=1.15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=1.15",
    "-filter_complex", "[0:a][1:a][2:a]amix=inputs=3:weights=1 0.55 0.65:duration=longest:normalize=0,afade=t=in:st=0:d=0.025,afade=t=out:st=0.35:d=0.8,lowpass=f=3200,aecho=0.8:0.7:85:0.3,volume=0.65",
    "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n2,
  ]);
  const rawSep = path.join(tmpDir, "sep-raw.wav");
  concatWavs([n1, n2], rawSep, tmpDir, "sep");
  boostEffectWav(rawSep, outWavPath);
}

function createSyntheticCortinaWav(outWavPath: string, tmpDir: string) {
  const pattern = [
    { bass: 110.0, note: 220.0 }, { bass: 110.0, note: 261.63 }, { bass: 110.0, note: 329.63 }, { bass: 110.0, note: 392.0 },
    { bass: 87.31, note: 174.61 }, { bass: 87.31, note: 220.0 }, { bass: 87.31, note: 261.63 }, { bass: 87.31, note: 329.63 },
    { bass: 98.0, note: 196.0 }, { bass: 98.0, note: 246.94 }, { bass: 98.0, note: 293.66 }, { bass: 98.0, note: 329.63 },
    { bass: 82.41, note: 164.81 }, { bass: 82.41, note: 246.94 }, { bass: 82.41, note: 293.66 }, { bass: 82.41, note: 392.0 },
  ];
  const stepWavs: string[] = [];
  pattern.forEach((step, idx) => {
    const p = path.join(tmpDir, `cortina-step-${idx}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${step.bass}:duration=0.5`, "-f", "lavfi", "-i", `sine=frequency=${step.note}:duration=0.5`, "-filter_complex", "[0:a]afade=t=in:st=0:d=0.03,afade=t=out:st=0.25:d=0.25,volume=0.35[b];[1:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.14:d=0.36,volume=0.32[n];[b][n]amix=inputs=2:duration=longest:normalize=0,lowpass=f=1250", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    stepWavs.push(p);
  });
  const rawLoop = path.join(tmpDir, "cortina-raw.wav");
  concatWavs(stepWavs, rawLoop, tmpDir, "cortina");
  runFfmpeg(["-i", rawLoop, "-af", "aecho=0.8:0.78:220|440:0.32|0.18", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
}

function normalizeCustomAssetToWav(srcPath: string, outWavPath: string) {
  runFfmpeg(["-i", srcPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
}

async function ensurePodcastCover() {
  if (fs.existsSync(COVER_PATH) || !fs.existsSync(LOGO_PATH)) return;
  await sharp(LOGO_PATH).resize(1400, 1400, { fit: "cover" }).png().toFile(COVER_PATH);
  console.log("  ✓ Portada 1400x1400 creada en public/podcast-cover.png");
}

function buildOpeningFemaleScript(editions: CountryEdition[], isWorldRoundup: boolean): string {
  const introScope = isWorldRoundup
    ? `En el programa de hoy recorremos lo más destacado del resto del mundo en ${editions.map((e) => e.country).join(", ")}.`
    : `En la edición de hoy viajamos a ${editions[0].country}.`;
  return `Bienvenidos a Jackpot Cultural, la edición sonora semanal de música, cine, series y libros del mundo. ${introScope} Comenzamos con los títulos destacados de la jornada.`;
}

function buildHeadlinesMaleScript(editions: CountryEdition[]): string {
  return editions.map((ed) => {
    const titles = ed.topics.slice(0, 3).map((t) => `${cleanSpeechText(t.category)}: ${cleanSpeechText(t.title)}.`).join(" ");
    return `En ${ed.country}: ${titles}`;
  }).join("\n\n");
}

function buildCountryPulseMaleScript(ed: CountryEdition): string {
  const pulse = ed.cultural_pulse
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => cleanSpeechText(p))
    .filter(Boolean)
    .join("\n\n");
  return [`Panorama cultural de ${ed.country}.`, cleanSpeechText(ed.intro), pulse].filter(Boolean).join("\n\n");
}

function buildCountryRecommendationMaleScript(ed: CountryEdition, hasMore: boolean): string {
  const rec = `Para descubrir en ${ed.country}: ${cleanSpeechText(ed.recommendation.title)}, de ${cleanSpeechText(ed.recommendation.creator)}. ${cleanSpeechText(ed.recommendation.context)}`;
  return hasMore ? `${rec} Pasamos al siguiente destino de la jornada.` : rec;
}

function buildClosingFemaleScript(): string {
  return "Esto fue Jackpot Cultural. Podés leer todas las ediciones completas, escuchar las radios locales de cada país y volver a girar la ruleta en jackpot guión cultural guión app punto vercel punto app. Suscribite al pódcast para no perderte la próxima emisión.";
}

async function loadCardFonts(): Promise<FontAsset[]> {
  const specs: { name: string; weight: 400 | 500 | 600 | 700; style: "normal" | "italic"; urls: string[] }[] = [
    { name: "Newsreader", weight: 500, style: "normal", urls: ["https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-500-normal.woff", "https://cdn.jsdelivr.net/npm/@fontsource/newsreader/files/newsreader-latin-500-normal.woff"] },
    { name: "Newsreader", weight: 400, style: "italic", urls: ["https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-400-italic.woff", "https://cdn.jsdelivr.net/npm/@fontsource/newsreader/files/newsreader-latin-400-italic.woff"] },
    { name: "Inter", weight: 400, style: "normal", urls: ["https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-400-normal.woff", "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff"] },
    { name: "Inter", weight: 600, style: "normal", urls: ["https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-600-normal.woff", "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-600-normal.woff"] },
  ];
  const fonts: FontAsset[] = [];
  for (const s of specs) {
    for (const url of s.urls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fonts.push({ name: s.name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight: s.weight, style: s.style });
          break;
        }
      } catch {
        // Probar siguiente dirección
      }
    }
  }
  return fonts;
}

async function preparePromoSquareUri(url?: string): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "JackpotCulturalBot/1.0 (+https://jackpot-cultural-app.vercel.app)" },
    });
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(raw).resize(600, 600, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function generatePodcastPromoCard(episode: EpisodeMeta, selected: CountryEdition[]) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
  const fonts = await loadCardFonts();
  if (fonts.length === 0) return;

  const isSingleCountry = selected.length === 1;
  const mainEd = selected[0];
  const fallbackImg = mainEd.cover_image?.url || (mainEd.closing_media?.type === "image" ? mainEd.closing_media.url : undefined);
  const squareCoverUri = await preparePromoSquareUri(fallbackImg);
  const coverSize = isSingleCountry ? "294px" : "240px";

  const items = isSingleCountry
    ? mainEd.topics.slice(0, 2).map((t) => ({
        tag: t.category.toUpperCase(),
        title: truncateText(cleanPlainText(t.title), 110),
        summary: fitCompleteSentences(t.summary, 240),
      }))
    : selected.slice(0, 3).map((ed) => ({
        tag: `${ed.country.toUpperCase()} · ${(ed.topics[0]?.category || "CULTURA").toUpperCase()}`,
        title: truncateText(cleanPlainText(ed.topics[0]?.title || ed.intro), 95),
        summary: fitCompleteSentences(ed.topics[0]?.summary || ed.intro, 225),
      }));

  const waveHeights = [16, 28, 42, 22, 48, 34, 18, 44, 30, 50, 24, 38, 20, 46, 28, 16, 36, 42, 24, 32, 18, 26];

  const headphonesIcon = {
    type: "svg",
    props: {
      width: "30",
      height: "30",
      viewBox: "0 0 24 24",
      fill: "none",
      children: [
        { type: "path", props: { d: "M3 18v-6a9 9 0 0 1 18 0v6", stroke: "#FAF8F3", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" } },
        { type: "path", props: { d: "M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z", stroke: "#FAF8F3", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" } },
      ],
    },
  };

  const playTriangleIcon = {
    type: "svg",
    props: {
      width: "34",
      height: "34",
      viewBox: "0 0 24 24",
      fill: "#FAF8F3",
      children: [{ type: "polygon", props: { points: "7,4 20,12 7,20" } }],
    },
  };

  const tree = {
    type: "div",
    props: {
      style: { width: "1080px", height: "1350px", boxSizing: "border-box", backgroundColor: "#161615", color: "#FAF8F3", display: "flex", flexDirection: "column", padding: "28px", fontFamily: "Inter" },
      children: [{
        type: "div",
        props: {
          style: { width: "1024px", height: "1294px", boxSizing: "border-box", border: "2px solid #4A4741", backgroundColor: "#FAF8F3", color: "#161615", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "30px 36px" },
          children: [
            {
              type: "div",
              props: {
                style: { width: "952px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #D6D0C4", paddingBottom: "16px" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", alignItems: "center", gap: "12px", backgroundColor: "#B83827", color: "#FAF8F3", padding: "10px 18px" },
                      children: [
                        headphonesIcon,
                        { type: "span", props: { style: { fontSize: "20px", letterSpacing: "3px", fontWeight: 600 }, children: "PÓDCAST DE JACKPOT CULTURAL" } },
                      ],
                    },
                  },
                  { type: "span", props: { style: { fontSize: "21px", letterSpacing: "3px", color: "#5C5952", fontWeight: 600 }, children: `${episode.week} · ${formatDuration(episode.durationSec)}` } },
                ],
              },
            },

            {
              type: "div",
              props: {
                style: { width: "952px", display: "flex", alignItems: "center", gap: "28px" },
                children: [
                  ...(squareCoverUri ? [{
                    type: "div",
                    props: {
                      style: { width: coverSize, height: coverSize, position: "relative", display: "flex", border: "2px solid #161615", backgroundColor: "#EFEAE0", overflow: "hidden" },
                      children: [
                        { type: "img", props: { src: squareCoverUri, style: { width: coverSize, height: coverSize, objectFit: "cover" } } },
                        {
                          type: "div",
                          props: {
                            style: { position: "absolute", right: "12px", bottom: "12px", width: "62px", height: "62px", borderRadius: "31px", backgroundColor: "#B83827", border: "3px solid #FAF8F3", display: "flex", alignItems: "center", justifyContent: "center" },
                            children: [playTriangleIcon],
                          },
                        },
                      ],
                    },
                  }] : []),
                  {
                    type: "div",
                    props: {
                      style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" },
                      children: [
                        { type: "span", props: { style: { fontSize: "20px", letterSpacing: "4px", color: "#B83827", fontWeight: 600 }, children: isSingleCountry ? `EDICIÓN SONORA · ${mainEd.continent.toUpperCase()}` : "EDICIÓN SONORA INTERNACIONAL" } },
                        { type: "span", props: { style: { marginTop: "6px", fontFamily: "Newsreader", fontSize: episode.subtitle.length > 13 ? "54px" : "68px", fontWeight: 500, lineHeight: 1.02, color: "#161615" }, children: episode.subtitle.toUpperCase() } },
                        { type: "span", props: { style: { marginTop: "8px", fontFamily: "Newsreader", fontStyle: "italic", fontSize: "26px", lineHeight: 1.3, color: "#383530" }, children: isSingleCountry ? "Crónica radial de música, cine, series y libros." : `Panorama semanal en ${selected.map((e) => e.country).join(", ")}.` } },
                        {
                          type: "div",
                          props: {
                            style: { display: "flex", alignItems: "center", gap: "7px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #D6D0C4" },
                            children: [
                              ...waveHeights.map((h, idx) => ({
                                type: "div",
                                props: { style: { width: "8px", height: `${h}px`, borderRadius: "4px", backgroundColor: idx < 11 ? "#B83827" : "#C8C2B6" } },
                              })),
                              { type: "span", props: { style: { marginLeft: "10px", fontSize: "20px", color: "#161615", fontWeight: 600 }, children: formatDuration(episode.durationSec) } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },

            {
              type: "div",
              props: {
                style: { width: "952px", display: "flex", flexDirection: "column", gap: isSingleCountry ? "34px" : "20px", borderTop: "2px solid #161615", paddingTop: isSingleCountry ? "26px" : "18px" },
                children: [
                  ...items.map((it) => ({
                    type: "div",
                    props: {
                      style: { width: "952px", boxSizing: "border-box", display: "flex", flexDirection: "column", borderLeft: "5px solid #B83827", paddingLeft: "22px" },
                      children: [
                        { type: "span", props: { style: { width: "925px", fontSize: isSingleCountry ? "20px" : "18px", letterSpacing: "3px", color: "#B83827", fontWeight: 600 }, children: it.tag } },
                        { type: "span", props: { style: { width: "925px", marginTop: "4px", fontFamily: "Newsreader", fontSize: isSingleCountry ? "37px" : "31px", fontWeight: 500, lineHeight: 1.13, color: "#161615" }, children: it.title } },
                        { type: "span", props: { style: { width: "925px", marginTop: "6px", fontSize: isSingleCountry ? "28px" : "23px", fontWeight: 400, lineHeight: 1.3, color: "#161615" }, children: it.summary } },
                      ],
                    },
                  })),
                  ...(isSingleCountry ? [{
                    type: "div",
                    props: {
                      style: { width: "952px", boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#EFEAE0", border: "1px solid #C8C2B6", padding: "18px 24px" },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: { display: "flex", flexDirection: "column", maxWidth: "740px" },
                            children: [
                              { type: "span", props: { style: { fontSize: "19px", letterSpacing: "3px", color: "#B83827", fontWeight: 600 }, children: `PARA DESCUBRIR · ${mainEd.recommendation.type.toUpperCase()}` } },
                              { type: "span", props: { style: { marginTop: "4px", fontFamily: "Newsreader", fontSize: "29px", color: "#161615" }, children: `${mainEd.recommendation.title} — ${mainEd.recommendation.creator}` } },
                            ],
                          },
                        },
                        { type: "span", props: { style: { fontSize: "18px", letterSpacing: "2px", color: "#5C5952", fontWeight: 600 }, children: "EN EL EPISODIO" } },
                      ],
                    },
                  }] : []),
                ],
              },
            },

            {
              type: "div",
              props: {
                style: { width: "952px", boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px", backgroundColor: "#161615", color: "#FAF8F3" },
                children: [
                  {
                    type: "div",
                    props: {
                      style: { display: "flex", flexDirection: "column" },
                      children: [
                        { type: "span", props: { style: { fontSize: "19px", letterSpacing: "3px", fontWeight: 600, color: "#E8DCD0" }, children: "ESCUCHÁ EL EPISODIO Y SUSCRIBITE GRATIS" } },
                        { type: "span", props: { style: { marginTop: "4px", fontFamily: "Newsreader", fontStyle: "italic", fontSize: "31px", color: "#FAF8F3" }, children: "Buscá Jackpot Cultural en Spotify" } },
                      ],
                    },
                  },
                  { type: "span", props: { style: { fontSize: "19px", letterSpacing: "2px", fontWeight: 600, color: "#FAF8F3", backgroundColor: "#B83827", padding: "12px 20px" }, children: "ENLACE EN BIO" } },
                ],
              },
            },
          ],
        },
      }],
    },
  };

  const svg = await satori(tree as Parameters<typeof satori>[0], { width: 1080, height: 1350, fonts });
  const outPath = path.join(CARDS_DIR, episode.cardFileName);
  await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toFile(outPath);
  console.log(`  ✓ Placa promocional creada: public/social-cards/${episode.cardFileName}`);
}

function writePodcastXml(episodes: EpisodeMeta[]) {
  const coverUrl = fs.existsSync(COVER_PATH) ? `${SITE_URL}/podcast-cover.png` : `${SITE_URL}/logo.png`;
  const ownerXml = PODCAST_EMAIL ? `\n    <itunes:owner>\n      <itunes:name>Jackpot Cultural</itunes:name>\n      <itunes:email>${escapeXml(PODCAST_EMAIL)}</itunes:email>\n    </itunes:owner>` : "";
  const itemsXml = episodes.map((ep) => `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <pubDate>${new Date(ep.pubDate).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
      <enclosure url="${escapeXml(`${SITE_URL}/podcast/${ep.fileName}`)}" length="${ep.bytes}" type="audio/mpeg" />
      <itunes:duration>${formatDuration(ep.durationSec)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Jackpot Cultural</title>
    <link>${escapeXml(SITE_URL)}</link>
    <atom:link href="${escapeXml(`${SITE_URL}/podcast.xml`)}" rel="self" type="application/rss+xml" />
    <language>es-ar</language>
    <description>Emisión internacional de música, cine, series, libros y escena cultural de 27 países.</description>
    <itunes:author>Jackpot Cultural</itunes:author>${ownerXml}
    <itunes:summary>De qué está hablando la cultura del mundo esta semana, en formato radial.</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Arts" />
    <itunes:image href="${escapeXml(coverUrl)}" />
${itemsXml}
  </channel>
</rss>
`;
  fs.writeFileSync(PODCAST_XML_PATH, xml, "utf-8");
}

async function main() {
  const args = process.argv.slice(2);
  const onlyCard = args.includes("--only-card");
  const argEd = args.find((a) => a.startsWith("--edition=") || a.startsWith("--countries=") || a.startsWith("--country="))?.split("=")[1]?.trim();

  const editions = loadEditions();
  if (editions.length === 0) throw new Error("No hay ediciones disponibles.");

  if (onlyCard) {
    if (!fs.existsSync(EPISODES_JSON_PATH)) throw new Error("No existe public/podcast/episodes.json.");
    const saved = JSON.parse(fs.readFileSync(EPISODES_JSON_PATH, "utf-8")) as EpisodeMeta[];
    const targetEp = argEd && argEd !== "automatica_hoy" ? saved.find((e) => e.key === argEd) || saved[0] : saved[0];
    if (!targetEp) throw new Error("No hay episodios guardados.");
    const selected = targetEp.countries.map((slug) => editions.find((e) => e.slug === slug)).filter((e): e is CountryEdition => Boolean(e));
    const isSingle = selected.length === 1;
    targetEp.headlines = isSingle
      ? selected[0].topics.slice(0, 3).map((t) => `${cleanPlainText(t.category)} — ${cleanPlainText(t.title)}`)
      : selected.map((ed) => `${ed.country}: ${cleanPlainText(ed.topics[0]?.title || ed.intro)}`);
    await generatePodcastPromoCard(targetEp, selected);
    fs.writeFileSync(EPISODES_JSON_PATH, `${JSON.stringify(saved, null, 2)}\n`, "utf-8");
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno.");

  const editionKey = !argEd || argEd === "automatica_hoy" ? resolveEditionKeyFromArgentinaDay() : argEd;
  const latestWeek = pickLatestWeek(editions);
  const { selected, label, isWorldRoundup } = selectEditionCountries(editions, latestWeek, editionKey);
  if (selected.length === 0) throw new Error("No se encontraron países válidos.");

  console.log(`=== Generando episodio [${editionKey}] (${latestWeek}): ${selected.map((s) => s.country).join(", ")} ===`);
  fs.mkdirSync(PODCAST_DIR, { recursive: true });
  fs.mkdirSync(AUDIO_ASSETS_DIR, { recursive: true });
  await ensurePodcastCover();

  const ai = new GoogleGenAI({ apiKey });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jackpot-podcast-"));

  try {
    const timelineWavs: string[] = [];
    const silShort = path.join(tmpDir, "sil-short.wav");
    createSilenceWav(silShort, 0.55);
    const silMed = path.join(tmpDir, "sil-med.wav");
    createSilenceWav(silMed, 0.9);

    const customIntroPath = path.join(AUDIO_ASSETS_DIR, "presentacion.mp3");
    const introFxWav = path.join(tmpDir, "00-intro-fx.wav");
    if (fs.existsSync(customIntroPath)) normalizeCustomAssetToWav(customIntroPath, introFxWav);
    else createElaborateIntroWav(introFxWav, tmpDir);
    timelineWavs.push(introFxWav, silShort);

    console.log("  [Voz femenina] Generando apertura...");
    const openingVoiceWav = path.join(tmpDir, "01-apertura-voz.wav");
    await synthesizeSegmentToWav(ai, buildOpeningFemaleScript(selected, isWorldRoundup), FEMALE_VOICE_NAME, "female-host", openingVoiceWav, tmpDir, 1);
    timelineWavs.push(openingVoiceWav, silShort);

    const customSepPath = path.join(AUDIO_ASSETS_DIR, "separador.mp3");
    const sepWav = path.join(tmpDir, "02-separador.wav");
    if (fs.existsSync(customSepPath)) normalizeCustomAssetToWav(customSepPath, sepWav);
    else createSyntheticChimeWav(sepWav, "sep", tmpDir);
    timelineWavs.push(sepWav, silShort);

    console.log("  [Voz masculina] Esperando 22s antes de los títulos...");
    await new Promise((r) => setTimeout(r, 22000));
    console.log("  [Voz masculina] Generando títulos breves...");
    const headlinesWav = path.join(tmpDir, "03-titulos.wav");
    await synthesizeSegmentToWav(ai, buildHeadlinesMaleScript(selected), MALE_VOICE_NAME, "male-host", headlinesWav, tmpDir, 2);
    timelineWavs.push(headlinesWav, silShort, sepWav, silMed);

    const customClickPath = path.join(AUDIO_ASSETS_DIR, "efecto.mp3");
    const clickWav = path.join(tmpDir, "click.wav");
    if (fs.existsSync(customClickPath)) normalizeCustomAssetToWav(customClickPath, clickWav);
    else createSyntheticChimeWav(clickWav, "click", tmpDir);

    let segIndex = 3;
    for (let i = 0; i < selected.length; i++) {
      const ed = selected[i];
      console.log(`  [Voz masculina] Esperando 22s antes de locutar ${ed.country}...`);
      await new Promise((r) => setTimeout(r, 22000));
      console.log(`  [Voz masculina] Generando crónica de ${ed.country}...`);
      const pulseWav = path.join(tmpDir, `04-pais-pulso-${i}.wav`);
      await synthesizeSegmentToWav(ai, buildCountryPulseMaleScript(ed), MALE_VOICE_NAME, "male-host", pulseWav, tmpDir, segIndex++);
      timelineWavs.push(pulseWav, silShort, clickWav, silShort);

      console.log(`  [Voz masculina] Esperando 22s antes de Para descubrir de ${ed.country}...`);
      await new Promise((r) => setTimeout(r, 22000));
      console.log(`  [Voz masculina] Generando Para descubrir de ${ed.country}...`);
      const recWav = path.join(tmpDir, `04-pais-rec-${i}.wav`);
      await synthesizeSegmentToWav(ai, buildCountryRecommendationMaleScript(ed, i < selected.length - 1), MALE_VOICE_NAME, "male-host", recWav, tmpDir, segIndex++);
      timelineWavs.push(recWav);

      if (i < selected.length - 1) timelineWavs.push(silShort, sepWav, silShort);
    }

    timelineWavs.push(silShort, sepWav, silShort);
    const closingVoiceWav = path.join(tmpDir, "05-cierre-voz.wav");
    if (fs.existsSync(CACHED_CLOSING_PATH)) {
      console.log("  [Voz femenina] Reutilizando cierre guardado (ahorra 1 pedido)...");
      normalizeCustomAssetToWav(CACHED_CLOSING_PATH, closingVoiceWav);
    } else {
      console.log("  [Voz femenina] Esperando 22s antes de generar y guardar cierre fijo...");
      await new Promise((r) => setTimeout(r, 22000));
      await synthesizeSegmentToWav(ai, buildClosingFemaleScript(), FEMALE_VOICE_NAME, "female-host", closingVoiceWav, tmpDir, segIndex);
      runFfmpeg(["-i", closingVoiceWav, "-c:a", "libmp3lame", "-b:a", "128k", CACHED_CLOSING_PATH]);
    }
    timelineWavs.push(closingVoiceWav, silShort);

    const customOutroPath = path.join(AUDIO_ASSETS_DIR, "cierre.mp3");
    const outroFxWav = path.join(tmpDir, "06-outro-fx.wav");
    if (fs.existsSync(customOutroPath)) normalizeCustomAssetToWav(customOutroPath, outroFxWav);
    else createElaborateOutroWav(outroFxWav, tmpDir);
    timelineWavs.push(outroFxWav);

    const voiceFullWav = path.join(tmpDir, "voice-full.wav");
    concatWavs(timelineWavs, voiceFullWav, tmpDir, "full");

    const voiceDuration = getAudioDurationSec(voiceFullWav);
    const fileName = `episodio-${latestWeek}-${editionKey}.mp3`;
    const cardFileName = `podcast-${editionKey}.jpg`;
    const finalMp3Path = path.join(PODCAST_DIR, fileName);

    const customCortinaPath = path.join(AUDIO_ASSETS_DIR, "cortina.mp3");
    let cortinaSource = customCortinaPath;
    if (!fs.existsSync(customCortinaPath)) {
      cortinaSource = path.join(tmpDir, "cortina-synth.wav");
      createSyntheticCortinaWav(cortinaSource, tmpDir);
    }

    const fadeOutStart = Math.max(1, voiceDuration - 2.6).toFixed(2);
    const totalDur = voiceDuration.toFixed(2);

    runFfmpeg([
      "-i", voiceFullWav,
      "-stream_loop", "-1",
      "-i", cortinaSource,
      "-filter_complex",
      `[0:a]asplit=2[v1][v2];[1:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutStart}:d=2.4,volume=0.88[bg];[bg][v1]sidechaincompress=threshold=0.03:ratio=4.5:attack=110:release=600[ducked];[v2][ducked]amix=inputs=2:duration=first:normalize=0[out]`,
      "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "128k", finalMp3Path,
    ]);

    const bytes = fs.statSync(finalMp3Path).size;
    const finalDuration = getAudioDurationSec(finalMp3Path);
    const headlines = isWorldRoundup
      ? selected.map((ed) => `${ed.country}: ${cleanPlainText(ed.topics[0]?.title || ed.intro)}`)
      : selected[0].topics.slice(0, 3).map((t) => `${cleanPlainText(t.category)} — ${cleanPlainText(t.title)}`);

    const episode: EpisodeMeta = {
      id: `jackpot-${latestWeek}-${editionKey}`,
      key: editionKey,
      week: latestWeek,
      title: `Jackpot Cultural · ${label} (${latestWeek})`,
      subtitle: label,
      description: isWorldRoundup
        ? `Lo más destacado de la semana en ${selected.map((e) => e.country).join(", ")}.`
        : `${cleanPlainText(selected[0].intro)}`,
      pubDate: new Date().toISOString(),
      fileName,
      cardFileName,
      bytes,
      durationSec: finalDuration,
      countries: selected.map((e) => e.slug),
      headlines,
    };

    await generatePodcastPromoCard(episode, selected);

    let existing: EpisodeMeta[] = [];
    if (fs.existsSync(EPISODES_JSON_PATH)) {
      try { existing = JSON.parse(fs.readFileSync(EPISODES_JSON_PATH, "utf-8")) as EpisodeMeta[]; } catch { existing = []; }
    }
    const merged = [episode, ...existing.filter((e) => e.id !== episode.id)];
    const kept = merged.slice(0, MAX_EPISODES_KEPT);
    for (const old of merged.slice(MAX_EPISODES_KEPT)) {
      const oldPath = path.join(PODCAST_DIR, old.fileName);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    fs.writeFileSync(EPISODES_JSON_PATH, `${JSON.stringify(kept, null, 2)}\n`, "utf-8");
    writePodcastXml(kept);
    console.log(`✓ Episodio generado: public/podcast/${fileName} (${formatDuration(finalDuration)}, ${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});