import { GoogleGenAI, Type } from "@google/genai";
import type {
  ClosingMedia,
  CountryEdition,
  CountrySourceConfig,
} from "../../src/lib/schema";
import {
  fetchWikimediaCoverImage,
  fetchWikipediaLeadImage,
  verifyYouTubeOEmbed,
} from "./fetch-image";
import {
  balanceSignalsBySource,
  enrichSignalsWithArticleContext,
  fetchCountryRssSignals,
  fetchGoogleNewsCulturalSignals,
} from "./fetch-rss";
import {
  buildResearchPrompt,
  buildSynthesisPrompt,
  EDITORIAL_SYSTEM_INSTRUCTION,
} from "./prompts";
import { validateEditionQuality } from "./quality-gate";
import { verifyCandidateUrls, type CandidateUrl } from "./verify-links";

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

let disableSearchForSession = false;

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

function isTransientError(msg: string): boolean {
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
  try {
    return await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents,
      config,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (config.tools) {
      throw err;
    }
    if (isTransientError(msg)) {
      console.warn(
        `  [Modelo] Reintentando con ${FALLBACK_MODEL} tras aviso temporal en ${PRIMARY_MODEL}...`
      );
      await sleep(3500);
      try {
        return await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents,
          config,
        });
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        if (isTransientError(msg2)) {
          await sleep(5000);
          return await ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents,
            config,
          });
        }
        throw err2;
      }
    }
    throw err;
  }
}

function resolveInlineLinks(
  rawPulse: string,
  verifiedUrls: CandidateUrl[],
  allowedUrlSet: Set<string>
): string {
  let count = 0;
  return rawPulse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => {
    const cleanTarget = String(target).trim();
    const id = Number(cleanTarget);
    const matched = Number.isInteger(id) ? verifiedUrls[id - 1] : undefined;

    if (matched && count < 3) {
      count++;
      return `[${label}](${matched.url})`;
    }
    if (allowedUrlSet.has(cleanTarget) && count < 3) {
      count++;
      return `[${label}](${cleanTarget})`;
    }
    return label;
  });
}

export async function generateCountryEdition(
  ai: GoogleGenAI,
  country: CountrySourceConfig,
  previousTopics: string[]
): Promise<CountryEdition> {
  const weekLabel = getCurrentIsoWeek();

  // Combinar RSS curados + Google News balanceados y enriquecer con párrafos reales abiertos
  const directRss = await fetchCountryRssSignals(country.rss_feeds);
  const newsRss = await fetchGoogleNewsCulturalSignals(
    country.slug,
    country.country
  );
  const balancedSignals = balanceSignalsBySource(
    [...directRss, ...newsRss],
    3,
    24
  );
  const rssSignals = await enrichSignalsWithArticleContext(balancedSignals);

  const formatSignals = (signals: typeof rssSignals) =>
    signals
      .map(
        (s) =>
          `- [${s.sourceTitle}] ${s.title}${s.snippet ? `: ${s.snippet}` : ""} (${s.url})`
      )
      .join("\n");

  let researchDossier = "";
  const candidateUrls: CandidateUrl[] = [];

  let searchSucceeded = false;
  if (!disableSearchForSession) {
    try {
      const researchPromptWithSearch = buildResearchPrompt(
        country,
        formatSignals(rssSignals),
        previousTopics,
        weekLabel,
        true
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
        researchDossier = text;
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
        "  [Plan B gratuito] Google Search no disponible en Nivel Gratuito. Activando feeds múltiples + lectura abierta + Google News RSS."
      );
    }
  }

  if (!searchSucceeded) {
    if (rssSignals.length < 2) {
      throw new Error(
        "No se obtuvieron suficientes señales culturales públicas para el Plan B."
      );
    }

    const fallbackPrompt = buildResearchPrompt(
      country,
      formatSignals(rssSignals),
      previousTopics,
      weekLabel,
      false
    );

    const fallbackResponse = await generateWithModelFallback(
      ai,
      fallbackPrompt,
      {
        systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
      }
    );

    researchDossier = fallbackResponse.text?.trim() || "";
  }

  if (researchDossier.length < 200) {
    throw new Error("El dossier de investigación devolvió contenido insuficiente.");
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

  const verifiedUrls = await verifyCandidateUrls(candidateUrls);
  if (verifiedUrls.length < 2) {
    throw new Error(
      `Solo se verificaron ${verifiedUrls.length} URLs reales; mínimo requerido: 2.`
    );
  }

  const allowedUrlSet = new Set(verifiedUrls.map((u) => u.url));

  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const synthesisPrompt =
      buildSynthesisPrompt(
        country,
        researchDossier,
        verifiedUrls,
        youtubeCandidates,
        weekLabel
      ) +
      (lastError
        ? `\n\nCORRECCIÓN OBLIGATORIA RESPECTO AL INTENTO ANTERIOR: ${lastError}`
        : "");

    const jsonResponse = await generateWithModelFallback(ai, synthesisPrompt, {
      systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
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
      },
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
    const recommendation = {
      type: recRaw.type,
      title: recRaw.title,
      creator: recRaw.creator,
      context: recRaw.context,
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
        ? parsedJson.visual_caption
        : `Escena cultural en ${country.country}.`;

    const rawPulse =
      typeof parsedJson.cultural_pulse === "string"
        ? parsedJson.cultural_pulse
        : "";
    const resolvedPulse = resolveInlineLinks(
      rawPulse,
      verifiedUrls,
      allowedUrlSet
    );
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
      typeof closingRaw.caption === "string" ? closingRaw.caption.trim() : "";

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
      // Primero busca retrato/foto exacta en Wikipedia; si no hay, intenta en Wikimedia Commons permitiendo retratos
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

    const assembled = {
      slug: country.slug,
      country: country.country,
      continent: country.continent,
      flag: country.flag,
      updated_at: new Date().toISOString(),
      edition_week: weekLabel,
      ...(coverImage ? { cover_image: coverImage } : {}),
      intro: parsedJson.intro,
      cultural_pulse: resolvedPulse,
      topics: parsedJson.topics,
      recommendation,
      ...(closingMedia ? { closing_media: closingMedia } : {}),
      sources,
    };

    const verdict = validateEditionQuality(assembled, allowedUrlSet);
    if (verdict.ok) {
      return verdict.data;
    }

    lastError =
      plainWordCount < 300
        ? `Tu 'cultural_pulse' anterior tuvo SOLO ${plainWordCount} palabras y el mínimo obligatorio es 300. Desarróllalo con hechos y obras concretas hasta alcanzar 350-420 palabras.`
        : plainWordCount > 800
          ? `Tu 'cultural_pulse' anterior tuvo ${plainWordCount} palabras (máximo 800). Resúmelo a unas 400 palabras.`
          : verdict.reason;

    console.warn(`  [Reintento ${attempt}] ${country.country}: ${lastError}`);
  }

  throw new Error(`Falló Quality Gate tras 3 intentos: ${lastError}`);
}