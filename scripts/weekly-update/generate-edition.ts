import { GoogleGenAI, Type } from "@google/genai";
import type {
  ClosingMedia,
  CountryEdition,
  CountrySourceConfig,
} from "../../src/lib/schema";
import {
  fetchWikimediaCoverImage,
  fetchWikipediaLeadImage,
  findWikipediaPageUrl,
  verifyYouTubeOEmbed,
} from "./fetch-image";
import {
  balanceSignalsBySource,
  enrichSignalsWithArticleContext,
  fetchCountryRssSignals,
  fetchGoogleNewsCulturalSignals,
} from "./fetch-rss";
import {
  buildDirectEditionPrompt,
  buildResearchPrompt,
  buildSynthesisPrompt,
  EDITORIAL_SYSTEM_INSTRUCTION,
} from "./prompts";
import { validateEditionQuality } from "./quality-gate";
import { verifyCandidateUrls, type CandidateUrl } from "./verify-links";

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

let disableSearchForSession = false;
let disablePrimaryModelForSession = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getCurrentIsoWeek(date = new Date()): string {
  const temp = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isTransientOrQuotaError(msg: string): boolean {
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("not found") ||
    msg.includes("404")
  );
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  contents: string,
  config: Record<string, unknown>
) {
  const activeModel = disablePrimaryModelForSession
    ? FALLBACK_MODEL
    : PRIMARY_MODEL;

  try {
    return await ai.models.generateContent({
      model: activeModel,
      contents,
      config,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (config.tools) {
      throw err;
    }

    if (!isTransientOrQuotaError(msg)) {
      throw err;
    }

    if (
      !disablePrimaryModelForSession &&
      (msg.includes("free_tier_requests") || msg.includes("limit: 20"))
    ) {
      disablePrimaryModelForSession = true;
      console.warn(
        `  [Cuota] ${PRIMARY_MODEL} alcanzó su tope diario gratuito. Cambiando a ${FALLBACK_MODEL} para el resto de la sesión.`
      );
    }

    const delays = [3500, 7000];
    let lastErr: unknown = err;

    for (const delay of delays) {
      console.warn(
        `  [Modelo] Reintentando con ${FALLBACK_MODEL} en ${delay / 1000}s...`
      );
      await sleep(delay);
      try {
        return await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents,
          config,
        });
      } catch (retryErr) {
        lastErr = retryErr;
        const retryMsg =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (!isTransientOrQuotaError(retryMsg)) {
          throw retryErr;
        }
      }
    }

    throw lastErr;
  }
}

function cleanRoboticTransitions(text: string): string {
  return text.replace(
    /(^|\n\n|[.!?]\s+)(?:Por un lado|Por otro lado|Paralelamente|En paralelo|Mientras tanto|Asimismo|Por su parte|Finalmente|En suma|En conclusión|En definitiva),?\s+(\*\*|\*|\[)?([a-záéíóúñüA-ZÁÉÍÓÚÑÜ])/g,
    (_, prefix: string, opener = "", firstChar: string) =>
      `${prefix}${opener}${firstChar.toUpperCase()}`
  );
}

function stripNumericCitations(text: string): string {
  return text
    .replace(/\s*\[(?:YT-)?\d{1,3}(?:\s*,\s*\d{1,3})*\](?!\()/g, "")
    .replace(/ +([.,;:!?])/g, "$1");
}

function ensureBoldHighlights(text: string): string {
  const existing = text.match(/\*\*([^*\n]{2,80})\*\*/g) || [];
  if (existing.length >= 2) return text;

  let added = 0;
  const needed = 3 - existing.length;
  const tokenRegex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

  const pass1 = text
    .split(tokenRegex)
    .map((part, idx) => {
      if (idx % 2 === 1 || added >= needed) return part;
      return part.replace(
        /(?<=[a-záéíóúñü,;]\s+)([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü0-9'’-]+(?:\s+(?:(?:de|del|la|las|los|el|y|e|and|of|the|&)\s+)*[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü0-9'’-]*){1,3})(?=[\s.,;:!?»)"'])/g,
        (match) => {
          if (added >= needed) return match;
          added++;
          return `**${match}**`;
        }
      );
    })
    .join("");

  if (existing.length + added >= 2) return pass1;

  const pass2 = pass1
    .split(tokenRegex)
    .map((part, idx) => {
      if (idx % 2 === 1) {
        if (
          existing.length + added < 2 &&
          part.startsWith("*") &&
          !part.startsWith("**") &&
          part.endsWith("*") &&
          part.length >= 4 &&
          part.length <= 60
        ) {
          added++;
          return `**${part.slice(1, -1)}**`;
        }
        return part;
      }
      return part;
    })
    .join("");

  if (existing.length + added >= 1) return pass2;

  return pass2
    .split(tokenRegex)
    .map((part, idx) => {
      if (idx % 2 === 1 || existing.length + added >= 2) return part;
      return part.replace(
        /(?<=[a-záéíóúñü,;]\s+)([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü0-9'’-]{3,})(?=[\s.,;:!?»)"'])/g,
        (match) => {
          if (existing.length + added >= 2) return match;
          added++;
          return `**${match}**`;
        }
      );
    })
    .join("");
}

function safeEncodeParens(url: string): string {
  return url.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

async function resolveInlineLinks(
  rawText: string,
  verifiedUrls: CandidateUrl[],
  allowedUrlSet: Set<string>,
  maxLinks = 6
): Promise<string> {
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const matches = Array.from(rawText.matchAll(regex));
  if (matches.length === 0) return rawText;

  let result = "";
  let lastIndex = 0;
  let linkCount = 0;

  for (const m of matches) {
    const fullMatch = m[0];
    const label = m[1];
    const target = String(m[2]).trim();
    const start = m.index ?? 0;

    result += rawText.slice(lastIndex, start);
    lastIndex = start + fullMatch.length;

    if (linkCount >= maxLinks) {
      result += label;
      continue;
    }

    if (/^wiki:/i.test(target)) {
      const query = target.replace(/^wiki:/i, "").trim();
      const wikiUrl = await findWikipediaPageUrl(query);
      if (wikiUrl) {
        const cleanUrl = safeEncodeParens(wikiUrl);
        allowedUrlSet.add(cleanUrl);
        linkCount++;
        result += `[${label}](${cleanUrl})`;
        continue;
      }
    }

    const normalizedTarget = target.replace(/^id[\s:-]*/i, "").trim();
    const id = Number(normalizedTarget);
    const matched = Number.isInteger(id) ? verifiedUrls[id - 1] : undefined;
    if (matched) {
      const cleanUrl = safeEncodeParens(matched.url);
      allowedUrlSet.add(cleanUrl);
      linkCount++;
      result += `[${label}](${cleanUrl})`;
      continue;
    }

    if (allowedUrlSet.has(target)) {
      const cleanUrl = safeEncodeParens(target);
      allowedUrlSet.add(cleanUrl);
      linkCount++;
      result += `[${label}](${cleanUrl})`;
      continue;
    }

    result += label;
  }

  result += rawText.slice(lastIndex);
  return result;
}

const EDITION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    "intro",
    "visual_query",
    "visual_caption",
    "cultural_pulse",
    "topics",
    "recommendation",
    "closing_media",
    "sources",
  ],
  properties: {
    intro: { type: Type.STRING },
    visual_query: { type: Type.STRING },
    visual_caption: { type: Type.STRING },
    cultural_pulse: { type: Type.STRING },
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["category", "title", "summary"],
        properties: {
          category: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
      },
    },
    recommendation: {
      type: Type.OBJECT,
      required: ["type", "title", "creator", "context", "source_id"],
      properties: {
        type: {
          type: Type.STRING,
          enum: [
            "Libro",
            "Película",
            "Exposición",
            "Autor",
            "Artista",
            "Movimiento",
            "Álbum",
            "Obra teatral",
          ],
        },
        title: { type: Type.STRING },
        creator: { type: Type.STRING },
        context: { type: Type.STRING },
        source_id: { type: Type.INTEGER },
      },
    },
    closing_media: {
      type: Type.OBJECT,
      required: ["mode", "caption"],
      properties: {
        mode: { type: Type.STRING, enum: ["video", "image", "none"] },
        youtube_url: { type: Type.STRING },
        image_query: { type: Type.STRING },
        caption: { type: Type.STRING },
      },
    },
    sources: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["id", "name", "paywalled"],
        properties: {
          id: { type: Type.INTEGER },
          name: { type: Type.STRING },
          paywalled: { type: Type.BOOLEAN },
        },
      },
    },
  },
};

export async function generateCountryEdition(
  ai: GoogleGenAI,
  country: CountrySourceConfig,
  previousTopics: string[]
): Promise<CountryEdition> {
  const weekLabel = getCurrentIsoWeek();

  const [directRss, newsRss] = await Promise.all([
    fetchCountryRssSignals(country.rss_feeds),
    fetchGoogleNewsCulturalSignals(country.slug, country.country),
  ]);

  const balancedSignals = balanceSignalsBySource(
    [...directRss, ...newsRss],
    3,
    24
  );
  const rssSignals = await enrichSignalsWithArticleContext(balancedSignals);

  const formatSignals = (signals: typeof rssSignals) =>
    signals
      .map((s) => {
        const extNote =
          s.externalLinks && s.externalLinks.length > 0
            ? ` | Enlaces internos citados: ${s.externalLinks
                .map((e) => `${e.label} (${e.url})`)
                .join(", ")}`
            : "";
        return `- [${s.sourceTitle}] ${s.title}${s.snippet ? `: ${s.snippet}` : ""} (${s.url})${extNote}`;
      })
      .join("\n");

  let researchDossier = "";
  const candidateUrls: CandidateUrl[] = [];
  const externalTitles = new Set<string>();

  let searchSucceeded = false;
  if (!disableSearchForSession) {
    try {
      const researchPromptWithSearch = buildResearchPrompt(
        country,
        formatSignals(rssSignals),
        previousTopics,
        weekLabel
      );

      const researchResponse = await generateWithModelFallback(
        ai,
        researchPromptWithSearch,
        {
          systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        }
      );

      const text = researchResponse.text?.trim() || "";
      const groundingChunks =
        researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks ||
        [];

      if (text.length >= 200) {
        researchDossier = stripNumericCitations(text);
        for (const chunk of groundingChunks) {
          if (chunk.web?.uri) {
            candidateUrls.push({
              title: chunk.web.title || "Fuente cultural",
              url: chunk.web.uri,
            });
          }
        }
        searchSucceeded = true;
      }
    } catch {
      disableSearchForSession = true;
      console.warn(
        "  [Plan B gratuito] Google Search no disponible en Nivel Gratuito. Usando modo directo en 1 llamada con feeds + lectura abierta."
      );
    }
  }

  if (!searchSucceeded && rssSignals.length < 2) {
    throw new Error(
      "No se obtuvieron suficientes señales culturales públicas para el Plan B."
    );
  }

  const youtubeCandidates = Array.from(
    new Set(
      rssSignals
        .map((s) => s.youtubeUrl)
        .filter((u): u is string => Boolean(u))
    )
  ).slice(0, 4);

  for (const sig of rssSignals) {
    candidateUrls.push({
      title: `${sig.sourceTitle} - ${sig.title}`,
      url: sig.url,
    });
  }

  for (const sig of rssSignals) {
    for (const ext of sig.externalLinks || []) {
      const taggedTitle = `${ext.label} (vía ${sig.sourceTitle})`;
      externalTitles.add(taggedTitle);
      candidateUrls.push({
        title: taggedTitle,
        url: ext.url,
      });
    }
  }

  const verifiedRaw = await verifyCandidateUrls(candidateUrls);
  if (verifiedRaw.length < 2) {
    throw new Error(
      `Solo se verificaron ${verifiedRaw.length} URLs reales; mínimo requerido: 2.`
    );
  }

  const verifiedUrls = verifiedRaw.map((u) => ({
    ...u,
    isExternal: externalTitles.has(u.title),
  }));
  const allowedUrlSet = new Set(verifiedUrls.map((u) => u.url));

  const rssContextText = formatSignals(rssSignals);

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const basePrompt = searchSucceeded
      ? buildSynthesisPrompt(
          country,
          researchDossier,
          verifiedUrls,
          youtubeCandidates,
          weekLabel
        )
      : buildDirectEditionPrompt(
          country,
          rssContextText,
          previousTopics,
          verifiedUrls,
          youtubeCandidates,
          weekLabel
        );

    const finalPrompt =
      basePrompt +
      (lastError
        ? `\n\nCORRECCIÓN OBLIGATORIA RESPECTO AL INTENTO ANTERIOR: ${lastError}`
        : "");

    const jsonResponse = await generateWithModelFallback(ai, finalPrompt, {
      systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: EDITION_RESPONSE_SCHEMA,
    });

    const rawText = jsonResponse.text;
    if (!rawText) {
      lastError = "Respuesta vacía del modelo.";
      continue;
    }

    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      lastError = "JSON inválido devuelto por el modelo.";
      continue;
    }

    const recRaw = (parsedJson.recommendation || {}) as Record<string, unknown>;
    const recId = Number(recRaw.source_id);
    const recUrl = verifiedUrls[recId - 1]?.url || verifiedUrls[0]?.url;
    const rawRecContext =
      typeof recRaw.context === "string"
        ? stripNumericCitations(recRaw.context)
        : "";
    const recContext =
      typeof recRaw.context === "string"
        ? await resolveInlineLinks(rawRecContext, verifiedUrls, allowedUrlSet, 2)
        : recRaw.context;
    const recommendation = {
      type: recRaw.type,
      title: recRaw.title,
      creator: recRaw.creator,
      context: recContext,
      url: recUrl,
    };

    const rawSources = Array.isArray(parsedJson.sources)
      ? (parsedJson.sources as Array<Record<string, unknown>>)
      : [];
    const seenUrls = new Set<string>();
    const sources: Array<{ name: string; url: string; paywalled: boolean }> = [];

    for (const s of rawSources) {
      const sid = Number(s.id);
      const matched = verifiedUrls[sid - 1];
      if (!matched || seenUrls.has(matched.url)) continue;
      seenUrls.add(matched.url);
      sources.push({
        name: String(s.name || matched.title).slice(0, 88),
        url: matched.url,
        paywalled: Boolean(s.paywalled),
      });
    }

    for (const fallbackUrl of verifiedUrls) {
      if (sources.length >= 3) break;
      if (fallbackUrl.isExternal) continue;
      if (seenUrls.has(fallbackUrl.url)) continue;
      seenUrls.add(fallbackUrl.url);
      sources.push({
        name:
          fallbackUrl.title.split(" - ")[0].slice(0, 88) || "Medio cultural",
        url: fallbackUrl.url,
        paywalled: false,
      });
    }

    const visualQuery =
      typeof parsedJson.visual_query === "string"
        ? parsedJson.visual_query
        : country.country;
    const visualCaption =
      typeof parsedJson.visual_caption === "string"
        ? stripNumericCitations(parsedJson.visual_caption)
        : `${country.country}: panorama cultural semanal.`;

    const rawPulse =
      typeof parsedJson.cultural_pulse === "string"
        ? stripNumericCitations(cleanRoboticTransitions(parsedJson.cultural_pulse))
        : "";
    const linkedPulse = await resolveInlineLinks(
      rawPulse,
      verifiedUrls,
      allowedUrlSet,
      6
    );
    const resolvedPulse = ensureBoldHighlights(linkedPulse);
    const plainWordCount = resolvedPulse
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    const coverImage = await fetchWikimediaCoverImage(
      visualQuery,
      visualCaption,
      undefined,
      false
    );

    let closingMedia: ClosingMedia | undefined;
    const closingRaw = (parsedJson.closing_media || {}) as Record<string, unknown>;
    const closingCaption =
      typeof closingRaw.caption === "string"
        ? stripNumericCitations(closingRaw.caption.trim())
        : "";

    if (
      closingRaw.mode === "video" &&
      typeof closingRaw.youtube_url === "string"
    ) {
      if (youtubeCandidates.includes(closingRaw.youtube_url)) {
        const embedUrl = await verifyYouTubeOEmbed(closingRaw.youtube_url);
        if (embedUrl && closingCaption.length >= 5) {
          closingMedia = {
            type: "video",
            url: embedUrl,
            caption: closingCaption.slice(0, 195),
          };
        }
      }
    } else if (
      closingRaw.mode === "image" &&
      typeof closingRaw.image_query === "string" &&
      closingCaption.length >= 5
    ) {
      const wikiImg = await fetchWikipediaLeadImage(
        closingRaw.image_query,
        closingCaption,
        coverImage?.url
      );
      const secondary =
        wikiImg ||
        (await fetchWikimediaCoverImage(
          closingRaw.image_query,
          closingCaption,
          coverImage?.url,
          true
        ));
      if (secondary) {
        closingMedia = {
          type: "image",
          url: secondary.url,
          caption: secondary.caption,
          credit: secondary.credit,
        };
      }
    }

    const cleanIntro =
      typeof parsedJson.intro === "string"
        ? await resolveInlineLinks(
            stripNumericCitations(parsedJson.intro),
            verifiedUrls,
            allowedUrlSet,
            2
          )
        : parsedJson.intro;

    const cleanTopics = Array.isArray(parsedJson.topics)
      ? await Promise.all(
          parsedJson.topics.map(async (t) => {
            if (t && typeof t === "object") {
              const topic = t as Record<string, unknown>;
              const titleText =
                typeof topic.title === "string"
                  ? await resolveInlineLinks(
                      stripNumericCitations(topic.title),
                      verifiedUrls,
                      allowedUrlSet,
                      1
                    )
                  : topic.title;
              const summaryText =
                typeof topic.summary === "string"
                  ? await resolveInlineLinks(
                      stripNumericCitations(topic.summary),
                      verifiedUrls,
                      allowedUrlSet,
                      2
                    )
                  : topic.summary;
              return {
                ...topic,
                title: titleText,
                summary: summaryText,
              };
            }
            return t;
          })
        )
      : parsedJson.topics;

    const assembled = {
      slug: country.slug,
      country: country.country,
      continent: country.continent,
      flag: country.flag,
      updated_at: new Date().toISOString(),
      edition_week: weekLabel,
      ...(coverImage ? { cover_image: coverImage } : {}),
      intro: cleanIntro,
      cultural_pulse: resolvedPulse,
      topics: cleanTopics,
      recommendation,
      ...(closingMedia ? { closing_media: closingMedia } : {}),
      sources,
    };

    const verdict = validateEditionQuality(assembled, allowedUrlSet);
    if (verdict.ok) {
      return verdict.data;
    }

    const recCtxLen =
      typeof recommendation.context === "string"
        ? recommendation.context.length
        : 0;

    lastError =
      plainWordCount < 200
        ? `Tu 'cultural_pulse' anterior tuvo SOLO ${plainWordCount} palabras y el mínimo obligatorio del sistema es 200 palabras. Desarrolla 3 o 4 párrafos completos con más detalles de obras, bandas, películas o libros del dossier hasta llegar a 320-450 palabras.`
        : plainWordCount > 800
          ? `Tu 'cultural_pulse' anterior tuvo ${plainWordCount} palabras (máximo 800). Resúmelo a unas 450 palabras.`
          : recCtxLen > 220
            ? `Tu 'recommendation.context' tuvo ${recCtxLen} caracteres y el máximo es 220. Escríbelo en 1 sola frase bien breve (120-180 caracteres).`
            : verdict.reason;

    console.warn(`  [Reintento ${attempt}] ${country.country}: ${lastError}`);
  }

  throw new Error(`Falló Quality Gate tras 3 intentos: ${lastError}`);
}