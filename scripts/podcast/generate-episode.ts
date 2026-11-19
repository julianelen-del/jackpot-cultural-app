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

function runFfmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
}

function cleanSpeechText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function createSyntheticChimeWav(outWavPath: string, kind: "intro" | "sep" | "click") {
  if (kind === "click") {
    // Clic breve tipo paso entre titulares
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:duration=0.07",
      "-af",
      "afade=t=out:st=0.01:d=0.06,volume=0.22",
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

  if (kind === "sep") {
    // Acorde suave de transición entre titulares y crónicas
    runFfmpeg([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=392:duration=1.1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=493.88:duration=1.1",
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.08,afade=t=out:st=0.35:d=0.75,volume=0.2",
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

  // Sintonía cálida de apertura de 2,2 segundos
  runFfmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=261.63:duration=2.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=329.63:duration=2.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=392.00:duration=2.2",
    "-filter_complex",
    "[0:a][1:a][2:a]amix=inputs=3:duration=longest,afade=t=in:st=0:d=0.25,afade=t=out:st=1.0:d=1.2,volume=0.22",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    outWavPath,
  ]);
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
    <itunes:author>Jackpot Cultural</itunes:author>
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

    // 1. Presentación / apertura
    const customIntroPath = path.join(AUDIO_ASSETS_DIR, "presentacion.mp3");
    const introWav = path.join(tmpDir, "00-intro.wav");
    if (fs.existsSync(customIntroPath)) {
      normalizeCustomAssetToWav(customIntroPath, introWav);
    } else {
      createSyntheticChimeWav(introWav, "intro");
    }
    timelineWavs.push(introWav);

    const silShort = path.join(tmpDir, "sil-short.wav");
    createSilenceWav(silShort, 0.45);
    const silMed = path.join(tmpDir, "sil-med.wav");
    createSilenceWav(silMed, 0.85);

    // 2. Bloque de títulos breves
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

    // 3. Separador entre títulos breves y texto principal
    const customSepPath = path.join(AUDIO_ASSETS_DIR, "separador.mp3");
    const sepWav = path.join(tmpDir, "02-separador.wav");
    if (fs.existsSync(customSepPath)) {
      normalizeCustomAssetToWav(customSepPath, sepWav);
    } else {
      createSyntheticChimeWav(sepWav, "sep");
    }
    timelineWavs.push(sepWav, silMed);

    // 4. Desarrollo por país (con pausa de 22s para cuidar el límite de 3 pedidos por minuto)
    const customClickPath = path.join(AUDIO_ASSETS_DIR, "efecto.mp3");
    const clickWav = path.join(tmpDir, "click.wav");
    if (fs.existsSync(customClickPath)) {
      normalizeCustomAssetToWav(customClickPath, clickWav);
    } else {
      createSyntheticChimeWav(clickWav, "click");
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

    // Concatenar pista de voz completa
    const listFile = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(
      listFile,
      timelineWavs.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n")
    );
    const voiceFullWav = path.join(tmpDir, "voice-full.wav");
    runFfmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c:a",
      "pcm_s16le",
      voiceFullWav,
    ]);

    const voiceDuration = getAudioDurationSec(voiceFullWav);
    const fileName = `episodio-${latestWeek}.mp3`;
    const finalMp3Path = path.join(PODCAST_DIR, fileName);

    // 5. Mezclar con cortina musical si existe public/audio/cortina.mp3
    const cortinaPath = path.join(AUDIO_ASSETS_DIR, "cortina.mp3");
    if (fs.existsSync(cortinaPath)) {
      const fadeOutStart = Math.max(1, voiceDuration - 2.5).toFixed(2);
      const totalDur = voiceDuration.toFixed(2);
      runFfmpeg([
        "-i",
        voiceFullWav,
        "-stream_loop",
        "-1",
        "-i",
        cortinaPath,
        "-filter_complex",
        `[0:a]asplit=2[v1][v2];[1:a]atrim=0:${totalDur},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2.2,volume=0.26[bg];[bg][v1]sidechaincompress=threshold=0.02:ratio=6:attack=120:release=700[ducked];[v2][ducked]amix=inputs=2:duration=first:normalize=0[out]`,
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        finalMp3Path,
      ]);
    } else {
      runFfmpeg([
        "-i",
        voiceFullWav,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        finalMp3Path,
      ]);
    }

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