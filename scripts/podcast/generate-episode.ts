import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import sharp from "sharp";
import { CountryEditionSchema, type Continent, type CountryEdition, type CountrySourceConfig } from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const AUDIO_ASSETS_DIR = path.join(process.cwd(), "public", "audio");
const PODCAST_DIR = path.join(process.cwd(), "public", "podcast");
const EPISODES_JSON_PATH = path.join(PODCAST_DIR, "episodes.json");
const PODCAST_XML_PATH = path.join(process.cwd(), "public", "podcast.xml");
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const COVER_PATH = path.join(process.cwd(), "public", "podcast-cover.png");
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://jackpot-cultural-app.vercel.app").replace(/\/+$/, "");

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

function cleanSpeechText(text: string): string {
  return normalizeEditionOrdinals(
    text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
      .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
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

function selectFeaturedEditions(editions: CountryEdition[], latestWeek: string, requestedSlugs: string[]): CountryEdition[] {
  if (requestedSlugs.length > 0) {
    return requestedSlugs.map((s) => editions.find((e) => e.slug === s)).filter((e): e is CountryEdition => Boolean(e));
  }
  const weekEditions = editions.filter((e) => e.edition_week === latestWeek);
  const pool = weekEditions.length >= 4 ? weekEditions : editions;
  const weekNumMatch = latestWeek.match(/W(\d+)/);
  const weekNum = weekNumMatch ? Number(weekNumMatch[1]) : 1;
  const continentOrder: Continent[] = ["América", "Europa", "Asia", "África", "Oceanía"];
  const selected: CountryEdition[] = [];
  for (const cont of continentOrder) {
    if (selected.length >= 4) break;
    const inCont = pool.filter((e) => e.continent === cont);
    if (inCont.length > 0) {
      const picked = inCont[weekNum % inCont.length];
      if (!selected.some((s) => s.slug === picked.slug)) selected.push(picked);
    }
  }
  return selected.slice(0, 4);
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
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${freq}:duration=0.055`, "-af", "afade=t=out:st=0.01:d=0.045,volume=0.45", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    const gap = path.join(tmpDir, `intro-gap-${i}.wav`);
    createSilenceWav(gap, i < 2 ? 0.14 : 0.08);
    parts.push(p, gap);
  });
  [{ f: 220.0, d: 0.24 }, { f: 261.63, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 440.0, d: 0.24 }, { f: 493.88, d: 1.4 }].forEach((n, i) => {
    const p = path.join(tmpDir, `intro-mel-${i}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`, "-f", "lavfi", "-i", `sine=frequency=${(n.f * 0.5).toFixed(2)}:duration=${n.d}`, "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=${(n.d * 0.4).toFixed(2)}:d=${(n.d * 0.6).toFixed(2)},lowpass=f=1350,aecho=0.8:0.75:90:0.32,volume=0.35`, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    parts.push(p);
  });
  concatWavs(parts, outWavPath, tmpDir, "intro");
}

function createElaborateOutroWav(outWavPath: string, tmpDir: string) {
  const parts: string[] = [];
  [{ f: 493.88, d: 0.24 }, { f: 392.0, d: 0.24 }, { f: 329.63, d: 0.24 }, { f: 220.0, d: 1.9 }].forEach((n, i) => {
    const p = path.join(tmpDir, `outro-mel-${i}.wav`);
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${n.f}:duration=${n.d}`, "-f", "lavfi", "-i", `sine=frequency=${(n.f * 1.5).toFixed(2)}:duration=${n.d}`, "-filter_complex", `[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.04,afade=t=out:st=${(n.d * 0.32).toFixed(2)}:d=${(n.d * 0.68).toFixed(2)},lowpass=f=1200,aecho=0.8:0.78:100:0.32,volume=0.34`, "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    parts.push(p);
  });
  const endClick = path.join(tmpDir, "outro-clk.wav");
  createSyntheticChimeWav(endClick, "click", tmpDir);
  parts.push(endClick);
  concatWavs(parts, outWavPath, tmpDir, "outro");
}

function createSyntheticChimeWav(outWavPath: string, kind: "sep" | "click", tmpDir: string) {
  if (kind === "click") {
    runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=760:duration=0.09", "-af", "afade=t=out:st=0.01:d=0.08,volume=0.55", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
    return;
  }
  const n1 = path.join(tmpDir, "sep-1.wav");
  const n2 = path.join(tmpDir, "sep-2.wav");
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=0.22", "-af", "afade=t=in:st=0:d=0.02,afade=t=out:st=0.07:d=0.15,aecho=0.8:0.65:60:0.28,volume=0.55", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n1]);
  runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=587.33:duration=1.15", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.15", "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=0.35:d=0.8,lowpass=f=1450,aecho=0.8:0.7:85:0.3,volume=0.36", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", n2]);
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
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${step.bass}:duration=0.5`, "-f", "lavfi", "-i", `sine=frequency=${step.note}:duration=0.5`, "-filter_complex", "[0:a]afade=t=in:st=0:d=0.03,afade=t=out:st=0.25:d=0.25,volume=0.26[b];[1:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.14:d=0.36,volume=0.24[n];[b][n]amix=inputs=2:duration=longest:normalize=0,lowpass=f=1050", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", p]);
    stepWavs.push(p);
  });
  const rawLoop = path.join(tmpDir, "cortina-raw.wav");
  concatWavs(stepWavs, rawLoop, tmpDir, "cortina");
  runFfmpeg(["-i", rawLoop, "-af", "aecho=0.8:0.78:220|440:0.32|0.18", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
}

function normalizeCustomAssetToWav(srcPath: string, outWavPath: string) {
  runFfmpeg(["-i", srcPath, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", outWavPath]);
}

async function ensurePodcastCover() {
  if (fs.existsSync(COVER_PATH) || !fs.existsSync(LOGO_PATH)) return;
  await sharp(LOGO_PATH).resize(1400, 1400, { fit: "cover" }).png().toFile(COVER_PATH);
  console.log("  ✓ Portada 1400x1400 creada en public/podcast-cover.png");
}

function buildOpeningFemaleScript(editions: CountryEdition[]): string {
  const names = editions.map((e) => e.country).join(", ");
  return `Bienvenidos a Jackpot Cultural, la edición sonora semanal de música, rock, cine, series y libros del mundo. En el programa de hoy recorremos ${names}. Comenzamos con los títulos destacados de la jornada.`;
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
  return [`Panorama cultural de ${ed.country}.`, cleanSpeechText(ed.intro), pulse, rec, hasMore ? "Pasamos al siguiente destino de esta semana." : ""].filter(Boolean).join("\n\n");
}

function buildClosingFemaleScript(): string {
  return "Esto fue el panorama semanal de Jackpot Cultural. Podés leer todas las ediciones completas, escuchar las radios locales de cada país y volver a girar la ruleta en jackpot guión cultural guión app punto vercel punto app. Gracias por acompañarnos y hasta la próxima emisión.";
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
    <description>Emisión semanal internacional de música, rock, cine, series, libros y escena cultural de 27 países.</description>
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
  const countriesArg = args.find((a) => a.startsWith("--countries=") || a.startsWith("--country="))?.split("=")[1];
  const requestedSlugs = countriesArg ? countriesArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const editions = loadEditions();
  if (editions.length === 0) throw new Error("No hay ediciones disponibles para locutar.");

  const latestWeek = pickLatestWeek(editions);
  const selected = selectFeaturedEditions(editions, latestWeek, requestedSlugs);
  if (selected.length === 0) throw new Error("No se encontraron países válidos.");

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
    await synthesizeSegmentToWav(ai, buildOpeningFemaleScript(selected), FEMALE_VOICE_NAME, "female-host", openingVoiceWav, tmpDir, 1);
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
    const fileName = `episodio-${latestWeek}.mp3`;
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
      `[0:a]asplit=2[v1][v2];[1:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOutStart}:d=2.4,volume=0.85[bg];[bg][v1]sidechaincompress=threshold=0.03:ratio=4.5:attack=110:release=600[ducked];[v2][ducked]amix=inputs=2:duration=first:normalize=0[out]`,
      "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "128k", finalMp3Path,
    ]);

    const bytes = fs.statSync(finalMp3Path).size;
    const finalDuration = getAudioDurationSec(finalMp3Path);
    const countryNames = selected.map((e) => e.country);

    const episode: EpisodeMeta = {
      id: `jackpot-${latestWeek}`,
      week: latestWeek,
      title: `Jackpot Cultural (${latestWeek}): ${countryNames.join(", ")}`,
      description: `Titulares y crónicas culturales de la semana en ${countryNames.join(", ")}.`,
      pubDate: new Date().toISOString(),
      fileName,
      bytes,
      durationSec: finalDuration,
      countries: selected.map((e) => e.slug),
    };

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