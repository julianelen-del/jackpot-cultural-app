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
const VOICE_NAME = process.env.PODCAST_VOICE || "Charon";
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
  outWavPath: string,
  tmpDir: string,
  idx: number
) {
  const prompt = `Lee el siguiente guion en voz alta en español rioplatense neutro, con tono cálido, natural, ágil y periodístico de conductor de radio cultural nocturna:\n\n${speechText}`;

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE_NAME },
        },
      },
    },
  });

  const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    throw new Error(`El modelo de voz no devolvió audio en el tramo ${idx}.`);
  }

  const pcmPath = path.join(tmpDir, `seg-${idx}.pcm`);
  fs.writeFileSync(pcmPath, Buffer.from(b64, "base64"));

  runFfmpeg([
    "-f",
    "s16le",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-i",
    pcmPath,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    outWavPath,
  ]);
}

function concatWavs(wavs: string[], outWavPath: string, tmpDir: string, tag: string) {
  const listFile = path.join(tmpDir, `concat-${tag}.txt`);
  fs.writeFileSync(
    listFile,
    wavs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n")
  );
  runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c:a",
    "pcm_s16le",
    outWavPath,
  ]);
}

function createElaborateIntroWav(outWavPath: string, tmpDir: string) {
  // 4 clics de ruleta acelerados + motivo musical ascendente de apertura radial
  const parts: string[] = [];
  const clickFreqs = [480, 560, 660, 780];
  clickFreqs.forEach((freq, i) => {
    const p = path.join(tmpDir, `intro-clk-${i}.wav`);
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${freq}:duration=0.06`,
      "-af",
      "afade=t=out:st=0.01:d=0.05,volume=0.4",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      p,
    ]);
    const gap = path.join(tmpDir, `intro-gap-${i}.wav`);
    createSilenceWav(gap, i < 2 ? 0.14 : 0.09);
    parts.push(p, gap);
  });

  const melodyNotes = [
    { f: 261.63, d: 0.28 },
    { f: 329.63, d: 0.28 },
    { f: 392.0, d: 0.28 },
    { f: 493.88, d: 1.55 },
  ];
  melodyNotes.forEach((n, i) => {
    const p = path.join(tmpDir, `intro-mel-${i}.wav`);
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${n.f}:duration=${n.d}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${(n.f * 0.5).toFixed(2)}:duration=${n.d}`,
      "-filter_complex",
      `[0:a][1:a]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.04,afade=t=out:st=${(n.d * 0.45).toFixed(2)}:d=${(n.d * 0.55).toFixed(2)},lowpass=f=1200,aecho=0.8:0.75:80:0.3,volume=0.45`,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      p,
    ]);
    parts.push(p);
  });

  concatWavs(parts, outWavPath, tmpDir, "intro");
}

function createElaborateOutroWav(outWavPath: string, tmpDir: string) {
  const notes = [
    { f: 392.0, d: 0.25 },
    { f: 329.63, d: 0.25 },
    { f: 261.63, d: 2.2 },
  ];
  const parts: string[] = [];
  notes.forEach((n, i) => {
    const p = path.join(tmpDir, `outro-mel-${i}.wav`);
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${n.f}:duration=${n.d}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${(n.f * 1.5).toFixed(2)}:duration=${n.d}`,
      "-filter_complex",
      `[0:a][1:a]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.05,afade=t=out:st=${(n.d * 0.35).toFixed(2)}:d=${(n.d * 0.65).toFixed(2)},lowpass=f=1100,aecho=0.8:0.78:95:0.3,volume=0.42`,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      p,
    ]);
    parts.push(p);
  });

  const endClick = path.join(tmpDir, "outro-clk.wav");
  createSyntheticChimeWav(endClick, "click", tmpDir);
  parts.push(endClick);

  concatWavs(parts, outWavPath, tmpDir, "outro");
}

function createSyntheticChimeWav(
  outWavPath: string,
  kind: "sep" | "click",
  tmpDir: string
) {
  if (kind === "click") {
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=720:duration=0.08",
      "-af",
      "afade=t=out:st=0.01:d=0.07,volume=0.38",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      outWavPath,
    ]);
    return;
  }

  // Separador doble bien audible entre títulos breves y desarrollo
  const n1 = path.join(tmpDir, "sep-1.wav");
  const n2 = path.join(tmpDir, "sep-2.wav");
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.22",
    "-af",
    "afade=t=in:st=0:d=0.02,afade=t=out:st=0.08:d=0.14,aecho=0.8:0.6:60:0.25,volume=0.44",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    n1,
  ]);
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=587.33:duration=1.1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1.1",
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.04,afade=t=out:st=0.35:d=0.75,lowpass=f=1300,aecho=0.8:0.7:85:0.28,volume=0.44",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    n2,
  ]);
  concatWavs([n1, n2], outWavPath, tmpDir, "sep");
}

function createSyntheticCortinaWav(outWavPath: string, tmpDir: string) {
  // Progresión cálida de 4 acordes de 2.5s cada uno (bucle de 10s) filtrada para sonar suave debajo de la voz
  const chords: number[][] = [
    [110.0, 220.0, 261.63, 329.63, 392.0], // Lam7
    [87.31, 174.61, 220.0, 261.63, 329.63], // Famaj7
    [98.0, 196.0, 246.94, 293.66, 349.23], // Sol7
    [82.41, 164.81, 246.94, 293.66, 392.0], // Mim7
  ];

  const chordWavs: string[] = [];
  chords.forEach((freqs, idx) => {
    const p = path.join(tmpDir, `chord-${idx}.wav`);
    const inputs = freqs.flatMap((f) => [
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${f}:duration=2.5`,
    ]);
    const mixTags = freqs.map((_, i) => `[${i}:a]`).join("");
    runFfmpeg([
      ...inputs,
      "-filter_complex",
      `${mixTags}amix=inputs=${freqs.length}:duration=longest,tremolo=f=1.6:d=0.22,lowpass=f=820,afade=t=in:st=0:d=0.1,afade=t=out:st=2.38:d=0.12,aecho=0.8:0.7:110:0.25,volume=0.55`,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      p,
    ]);
    chordWavs.push(p);
  });

  concatWavs(chordWavs, outWavPath, tmpDir, "cortina");
}

function createSilenceWav(outWavPath: string, sec: number) {
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=44100:cl=stereo:d=${sec}`,
    "-c:a",
    "pcm_s16le",
    outWavPath,
  ]);
}

function normalizeCustomAssetToWav(srcPath: string, outWavPath: string) {
  runFfmpeg([
    "-i",
    srcPath,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    outWavPath,
  ]);
}

async function ensurePodcastCover() {
  if (fs.existsSync(COVER_PATH)) return;
  if (!fs.existsSync(LOGO_PATH)) return;
  await sharp(LOGO_PATH)
    .resize(1400, 1400, { fit: "cover" })
    .png()
    .toFile(COVER_PATH);
  console.log("  ✓ Portada 1400x1400 creada en public/podcast-cover.png");
}

function buildHeadlinesScript(editions: CountryEdition[]): string {
  const names = editions.map((e) => e.country).join(", ");
  const lines = [
    `Bienvenidos a Jackpot Cultural, la edición sonora semanal de música, cine, series y libros del mundo.`,
    `En el programa de esta semana recorremos ${names}.`,
    `Antes de entrar en las crónicas, repasamos los títulos destacados de la jornada.`,
  ];

  for (const ed of editions) {
    const titles = ed.topics
      .slice(0, 3)
      .map((t) => `${cleanSpeechText(t.category)}: ${cleanSpeechText(t.title)}.`)
      .join(" ");
    lines.push(`En ${ed.country}: ${titles}`);
  }

  return lines.join("\n\n");
}

function buildCountryBodyScript(
  ed: CountryEdition,
  isLast: boolean
): string {
  const intro = cleanSpeechText(ed.intro);
  const pulse = ed.cultural_pulse
    .split(/\n{2,}/)
    .map((p) => cleanSpeechText(p))
    .filter(Boolean)
    .join("\n\n");
  const rec = `Para descubrir en ${ed.country}: ${cleanSpeechText(ed.recommendation.title)}, de ${cleanSpeechText(ed.recommendation.creator)}. ${cleanSpeechText(ed.recommendation.context)}`;

  const closing = isLast
    ? `Esto fue el panorama semanal de Jackpot Cultural. Podés leer todas las ediciones, escuchar las radios locales de cada país y volver a girar la ruleta en jackpot guión cultural guión app punto vercel punto app. Hasta la próxima emisión.`
    : `Pasamos al siguiente destino de esta semana.`;

  return [
    `Panorama cultural de ${ed.country}.`,
    intro,
    pulse,
    rec,
    closing,
  ].join("\n\n");
}

function writePodcastXml(episodes: EpisodeMeta[]) {
  const coverUrl = fs.existsSync(COVER_PATH)
    ? `${SITE_URL}/podcast-cover.png`
    : `${SITE_URL}/logo.png`;

  const ownerXml = PODCAST_EMAIL
    ? `\n    <itunes:owner>\n      <itunes:name>Jackpot Cultural</itunes:name>\n      <itunes:email>${escapeXml(PODCAST_EMAIL)}</itunes:email>\n    </itunes:owner>`
    : "";

  const itemsXml = episodes
    .map((ep) => {
      const mp3Url = `${SITE_URL}/podcast/${ep.fileName}`;
      return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <pubDate>${new Date(ep.pubDate).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
      <enclosure url="${escapeXml(mp3Url)}" length="${ep.bytes}" type="audio/mpeg" />
      <itunes:duration>${formatDuration(ep.durationSec)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    })
    .join("\n");

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
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el entorno.");
  }

  const args = process.argv.slice(2);
  const countriesArg = args
    .find((a) => a.startsWith("--countries=") || a.startsWith("--country="))
    ?.split("=")[1];
  const requestedSlugs = countriesArg
    ? countriesArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const editions = loadEditions();
  if (editions.length === 0) {
    throw new Error("No hay ediciones disponibles para locutar.");
  }

  const latestWeek = pickLatestWeek(editions);
  const selected = selectFeaturedEditions(editions, latestWeek, requestedSlugs);
  if (selected.length === 0) {
    throw new Error("No se encontraron países válidos para el episodio.");
  }

  fs.mkdirSync(PODCAST_DIR, { recursive: true });
  await ensurePodcastCover();

  const ai = new GoogleGenAI({ apiKey });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jackpot-podcast-"));

  try {
    const timelineWavs: string[] = [];

    const customIntroPath = path.join(AUDIO_ASSETS_DIR, "presentacion.mp3");
    const introWav = path.join(tmpDir, "00-intro.wav");
    if (fs.existsSync(customIntroPath)) {
      normalizeCustomAssetToWav(customIntroPath, introWav);
    } else {
      createElaborateIntroWav(introWav, tmpDir);
    }
    timelineWavs.push(introWav);

    const silShort = path.join(tmpDir, "sil-short.wav");
    createSilenceWav(silShort, 0.55);
    const silMed = path.join(tmpDir, "sil-med.wav");
    createSilenceWav(silMed, 0.95);

    console.log("  [Voz] Generando presentación y títulos breves...");
    const headlinesWav = path.join(tmpDir, "01-titulos.wav");
    await synthesizeSegmentToWav(
      ai,
      buildHeadlinesScript(selected),
      headlinesWav,
      tmpDir,
      1
    );
    timelineWavs.push(silShort, headlinesWav, silShort);

    const customSepPath = path.join(AUDIO_ASSETS_DIR, "separador.mp3");
    const sepWav = path.join(tmpDir, "02-separador.wav");
    if (fs.existsSync(customSepPath)) {
      normalizeCustomAssetToWav(customSepPath, sepWav);
    } else {
      createSyntheticChimeWav(sepWav, "sep", tmpDir);
    }
    timelineWavs.push(sepWav, silMed);

    const customClickPath = path.join(AUDIO_ASSETS_DIR, "efecto.mp3");
    const clickWav = path.join(tmpDir, "click.wav");
    if (fs.existsSync(customClickPath)) {
      normalizeCustomAssetToWav(customClickPath, clickWav);
    } else {
      createSyntheticChimeWav(clickWav, "click", tmpDir);
    }

    for (let i = 0; i < selected.length; i++) {
      const ed = selected[i];
      console.log(`  [Voz] Esperando 22s antes de locutar ${ed.country}...`);
      await new Promise((r) => setTimeout(r, 22000));

      console.log(`  [Voz] Generando crónica de ${ed.country}...`);
      const bodyWav = path.join(tmpDir, `03-pais-${i}.wav`);
      await synthesizeSegmentToWav(
        ai,
        buildCountryBodyScript(ed, i === selected.length - 1),
        bodyWav,
        tmpDir,
        i + 2
      );
      timelineWavs.push(bodyWav);

      if (i < selected.length - 1) {
        timelineWavs.push(silShort, clickWav, silShort);
      }
    }

    // Cierre musical elaborado al final del episodio
    const customOutroPath = path.join(AUDIO_ASSETS_DIR, "cierre.mp3");
    const outroWav = path.join(tmpDir, "04-outro.wav");
    if (fs.existsSync(customOutroPath)) {
      normalizeCustomAssetToWav(customOutroPath, outroWav);
    } else {
      createElaborateOutroWav(outroWav, tmpDir);
    }
    timelineWavs.push(silShort, outroWav);

    const voiceFullWav = path.join(tmpDir, "voice-full.wav");
    concatWavs(timelineWavs, voiceFullWav, tmpDir, "full");

    const voiceDuration = getAudioDurationSec(voiceFullWav);
    const fileName = `episodio-${latestWeek}.mp3`;
    const finalMp3Path = path.join(PODCAST_DIR, fileName);

    // Cortina musical: usa public/audio/cortina.mp3 si existe, sino la cortina cálida sintetizada
    const customCortinaPath = path.join(AUDIO_ASSETS_DIR, "cortina.mp3");
    let cortinaSource = customCortinaPath;
    if (!fs.existsSync(customCortinaPath)) {
      cortinaSource = path.join(tmpDir, "cortina-synth.wav");
      createSyntheticCortinaWav(cortinaSource, tmpDir);
    }

    const fadeOutStart = Math.max(1, voiceDuration - 2.6).toFixed(2);
    const totalDur = voiceDuration.toFixed(2);

    runFfmpeg([
      "-i",
      voiceFullWav,
      "-stream_loop",
      "-1",
      "-i",
      cortinaSource,
      "-filter_complex",
      `[0:a]asplit=2[v1][v2];[1:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2.4,volume=0.28[bg];[bg][v1]sidechaincompress=threshold=0.018:ratio=8:attack=90:release=650[ducked];[v2][ducked]amix=inputs=2:duration=first:normalize=0[out]`,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      finalMp3Path,
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
      try {
        existing = JSON.parse(
          fs.readFileSync(EPISODES_JSON_PATH, "utf-8")
        ) as EpisodeMeta[];
      } catch {
        existing = [];
      }
    }

    const merged = [
      episode,
      ...existing.filter((e) => e.id !== episode.id),
    ];

    const kept = merged.slice(0, MAX_EPISODES_KEPT);
    const dropped = merged.slice(MAX_EPISODES_KEPT);
    for (const old of dropped) {
      const oldPath = path.join(PODCAST_DIR, old.fileName);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    fs.writeFileSync(
      EPISODES_JSON_PATH,
      `${JSON.stringify(kept, null, 2)}\n`,
      "utf-8"
    );
    writePodcastXml(kept);

    console.log(
      `✓ Episodio generado: public/podcast/${fileName} (${formatDuration(finalDuration)}, ${(bytes / 1024 / 1024).toFixed(2)} MB)`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});