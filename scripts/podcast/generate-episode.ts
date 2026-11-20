import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import satori from "satori";
import sharp from "sharp";
import { CountryEditionSchema, type CountryEdition, type CountrySourceConfig } from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const AUDIO_ASSETS_DIR = path.join(process.cwd(), "public", "audio");
const PODCAST_DIR = path.join(process.cwd(), "public", "podcast");
const CARDS_DIR = path.join(process.cwd(), "public", "social-cards");
const EPISODES_JSON_PATH = path.join(PODCAST_DIR, "episodes.json");
const PODCAST_XML_PATH = path.join(process.cwd(), "public", "podcast.xml");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const COVER_PATH = path.join(process.cwd(), "public", "podcast-cover.png");
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
  runFfmpeg(["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcmPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
}

function concatWavs(wavs: string[], outWavPath: string, tmpDir: string, tag: string) {
  const listFile = path.join(tmpDir, `concat-${tag}.txt`);
  fs.writeFileSync(listFile, wavs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  runFfmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "pcm_s16le", outWavPath]);
}

function createSilenceWav(outWavPath: string, sec: number) {
  runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${sec}`, "-c:a", "pcm_s16le", outWavPath]);
}

function createElaborateIntroWav(outWavPath: string, tmpDir: string) {
  const parts: string[] = [];
  [440, 523.25, 622.25, 740, 880].forEach((freq, i) => {
    const p = path.join(tmpDir, `intro-clk-${i}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${freq}:duration=0.06`, "-af", "afade=t=out:st=0.01:d=0.05,volume=0.88", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    const gap = path.join(tmpDir, `intro-gap-${i}.wav`);
    createSilenceWav(gap, i < 2 ? 0.13 : 0.08);
    parts.push(p, gap);
  });
  [{ f: 220.0, d: 0.24 }, { f: 261.63, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 440.0, d: 0.24 }, { f: 493.88, d: 1.4 }].forEach((n, i) => {
    const p = path.join(tmpDir, `intro-mel-${i}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`, "-f", "lavfi", "-i", `sine=frequency=${(n.f * 0.5).toFixed(2)}:duration=${n.d}`, "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=${(n.d * 0.4).toFixed(2)}:d=${(n.d * 0.6).toFixed(2)},lowpass=f=1500,aecho=0.8:0.75:90:0.34,volume=0.78`, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    parts.push(p);
  });
  concatWavs(parts, outWavPath, tmpDir, "intro");
}

function createElaborateOutroWav(outWavPath: string, tmpDir: string) {
  const parts: string[] = [];
  [{ f: 493.88, d: 0.24 }, { f: 392.0, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 220.0, d: 1.9 }].forEach((n, i) => {
    const p = path.join(tmpDir, `outro-mel-${i}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`, "-f", "lavfi", "-i", `sine=frequency=${(n.f * 1.5).toFixed(2)}:duration=${n.d}`, "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.04,afade=t=out:st=${(n.d * 0.35).toFixed(2)}:d=${(n.d * 0.65).toFixed(2)},lowpass=f=1400,aecho=0.8:0.78:100:0.34,volume=0.78`, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    parts.push(p);
  });
  const endClick = path.join(tmpDir, "outro-clk.wav");
  createSyntheticChimeWav(endClick, "click", tmpDir);
  parts.push(endClick);
  concatWavs(parts, outWavPath, tmpDir, "outro");
}

function createSyntheticChimeWav(outWavPath: string, kind: "sep" | "click", tmpDir: string) {
  if (kind === "click") {
    runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=760:duration=0.09", "-af", "afade=t=out:st=0.01:d=0.08,volume=0.85", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
    return;
  }
  const n1 = path.join(tmpDir, "sep-1.wav");
  const n2 = path.join(tmpDir, "sep-2.wav");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=0.22", "-af", "afade=t=in:st=0:d=0.02,afade=t=out:st=0.07:d=0.15,aecho=0.8:0.65:60:0.28,volume=0.88", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n1]);
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=587.33:duration=1.15", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.15", "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=0.35:d=0.8,lowpass=f=1550,aecho=0.8:0.7:85:0.3,volume=0.72", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n2]);
  concatWavs([n1, n2], outWavPath, tmpDir, "sep");
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
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${step.bass}:duration=0.5`, "-f", "lavfi", "-i", `sine=frequency=${step.note}:duration=0.5`, "-filter_complex", "[0:a]afade=t=in:st=0:d=0.03,afade=t=out:st=0.25:d=0.25,volume=0.32[b];[1:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.14:d=0.36,volume=0.28[n];[b][n]amix=inputs=2:duration=longest:normalize=0,lowpass=f=1100", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
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

function buildCountryBodyMaleScript(ed: CountryEdition, hasMore: boolean): string {
  const pulse = ed.cultural_pulse.split(/\n{2,}/).map((p) => cleanSpeechText(p)).filter(Boolean).join("\n\n");
  const rec = `Para descubrir en ${ed.country}: ${cleanSpeechText(ed.recommendation.title)}, de ${cleanSpeechText(ed.recommendation.creator)}. ${cleanSpeechText(ed.recommendation.context)}`;
  return [`Panorama cultural de ${ed.country}.`, cleanSpeechText(ed.intro), pulse, rec, hasMore ? "Pasamos al siguiente destino de la jornada." : ""].filter(Boolean).join("\n\n");
}

function buildClosingFemaleScript(): string {
  return "Esto fue Jackpot Cultural. Podés leer todas las ediciones completas, escuchar las radios locales de cada país y volver a girar la ruleta en jackpot guión cultural guión app punto vercel punto app. Suscribite al pódcast para no perderte la próxima emisión.";
}

async function loadCardFonts(): Promise<FontAsset[]> {
  const specs: { name: string; weight: 400 | 500 | 600 | 700; style: "normal" | "italic"; url: string }[] = [
    { name: "Newsreader", weight: 500, style: "normal", url: "https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-500-normal.woff" },
    { name: "Newsreader", weight: 400, style: "italic", url: "https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-400-italic.woff" },
    { name: "Inter", weight: 600, style: "normal", url: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-600-normal.woff" },
  ];
  const fonts: FontAsset[] = [];
  for (const s of specs) {
    const res = await fetch(s.url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fonts.push({ name: s.name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight: s.weight, style: s.style });
    }
  }
  return fonts;
}

async function generatePodcastPromoCard(episode: EpisodeMeta, selected: CountryEdition[]) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
  const fonts = await loadCardFonts();
  if (fonts.length === 0) return;

  let logoUri: string | null = null;
  if (fs.existsSync(LOGO_PATH)) {
    const logoBuf = await sharp(LOGO_PATH).resize(150, 150).png().toBuffer();
    logoUri = `data:image/png;base64,${logoBuf.toString("base64")}`;
  }

  const headlines = episode.headlines.slice(0, 3).map((h) => truncateText(h, 88));
  const tree = {
    type: "div",
    props: {
      style: { width: "1080px", height: "1350px", boxSizing: "border-box", backgroundColor: "#161615", color: "#FAF8F3", display: "flex", flexDirection: "column", padding: "38px", fontFamily: "Inter" },
      children: [{
        type: "div",
        props: {
          style: { width: "1004px", height: "1274px", boxSizing: "border-box", border: "2px solid #4A4741", backgroundColor: "#FAF8F3", color: "#161615", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 44px" },
          children: [
            {
              type: "div",
              props: {
                style: { width: "916px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #D6D0C4", paddingBottom: "18px" },
                children: [
                  { type: "span", props: { style: { fontSize: "22px", letterSpacing: "4px", color: "#B83827", fontWeight: 600 }, children: "NUEVO EPISODIO · PÓDCAST" } },
                  { type: "span", props: { style: { fontSize: "22px", letterSpacing: "3px", color: "#5C5952", fontWeight: 600 }, children: `${episode.week} · ${formatDuration(episode.durationSec)}` } },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { width: "916px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginTop: "10px" },
                children: [
                  ...(logoUri ? [{ type: "img", props: { src: logoUri, style: { width: "138px", height: "138px", borderRadius: "69px", border: "2px solid #161615", marginBottom: "20px" } } }] : []),
                  { type: "span", props: { style: { fontSize: "22px", letterSpacing: "5px", color: "#5C5952", fontWeight: 600 }, children: "JACKPOT CULTURAL EN SPOTIFY" } },
                  { type: "span", props: { style: { marginTop: "10px", fontFamily: "Newsreader", fontSize: episode.subtitle.length > 14 ? "66px" : "82px", fontWeight: 500, lineHeight: 1.05, color: "#161615" }, children: episode.subtitle.toUpperCase() } },
                  { type: "span", props: { style: { marginTop: "14px", fontFamily: "Newsreader", fontStyle: "italic", fontSize: "30px", lineHeight: 1.35, color: "#4B4842", maxWidth: "840px" }, children: selected.length === 1 ? truncateText(cleanPlainText(selected[0].intro), 150) : `Lo más destacado de la semana en ${selected.map((e) => e.country).join(", ")}.` } },
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { width: "916px", display: "flex", flexDirection: "column", gap: "18px", borderTop: "2px solid #161615", paddingTop: "24px" },
                children: [
                  { type: "span", props: { style: { fontSize: "20px", letterSpacing: "4px", color: "#B83827", fontWeight: 600 }, children: "EN ESTE EPISODIO" } },
                  ...headlines.map((h) => ({
                    type: "div",
                    props: {
                      style: { width: "916px", boxSizing: "border-box", display: "flex", borderLeft: "5px solid #B83827", paddingLeft: "20px" },
                      children: [{ type: "span", props: { style: { width: "890px", fontFamily: "Newsreader", fontSize: "30px", lineHeight: 1.25, color: "#161615" }, children: h } }],
                    },
                  })),
                ],
              },
            },
            {
              type: "div",
              props: {
                style: { width: "916px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "26px 28px", backgroundColor: "#161615", color: "#FAF8F3" },
                children: [
                  { type: "span", props: { style: { fontSize: "21px", letterSpacing: "4px", fontWeight: 600, color: "#E8DCD0" }, children: "ESCUCHALO Y SUSCRIBITE GRATIS" } },
                  { type: "span", props: { style: { marginTop: "8px", fontFamily: "Newsreader", fontStyle: "italic", fontSize: "33px", color: "#FAF8F3" }, children: "Buscá Jackpot Cultural en Spotify" } },
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el entorno.");

  const args = process.argv.slice(2);
  const argEd = args.find((a) => a.startsWith("--edition=") || a.startsWith("--countries=") || a.startsWith("--country="))?.split("=")[1]?.trim();
  const editionKey = !argEd || argEd === "automatica_hoy" ? resolveEditionKeyFromArgentinaDay() : argEd;

  const editions = loadEditions();
  if (editions.length === 0) throw new Error("No hay ediciones disponibles para locutar.");

  const latestWeek = pickLatestWeek(editions);
  const { selected, label, isWorldRoundup } = selectEditionCountries(editions, latestWeek, editionKey);
  if (selected.length === 0) throw new Error("No se encontraron países válidos.");

  console.log(`=== Generando episodio [${editionKey}] (${latestWeek}): ${selected.map((s) => s.country).join(", ")} ===`);
  fs.mkdirSync(PODCAST_DIR, { recursive: true });
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
      const bodyWav = path.join(tmpDir, `04-pais-${i}.wav`);
      await synthesizeSegmentToWav(ai, buildCountryBodyMaleScript(ed, i < selected.length - 1), MALE_VOICE_NAME, "male-host", bodyWav, tmpDir, segIndex++);
      timelineWavs.push(bodyWav);
      if (i < selected.length - 1) timelineWavs.push(silShort, clickWav, silShort);
    }

    timelineWavs.push(silShort, sepWav, silShort);
    console.log("  [Voz femenina] Esperando 22s antes del cierre...");
    await new Promise((r) => setTimeout(r, 22000));
    console.log("  [Voz femenina] Generando cierre...");
    const closingVoiceWav = path.join(tmpDir, "05-cierre-voz.wav");
    await synthesizeSegmentToWav(ai, buildClosingFemaleScript(), FEMALE_VOICE_NAME, "female-host", closingVoiceWav, tmpDir, segIndex);
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
    const headlines = selected.flatMap((ed) => ed.topics.slice(0, isWorldRoundup ? 1 : 3).map((t) => `${ed.country}: ${cleanPlainText(t.title)}`));

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