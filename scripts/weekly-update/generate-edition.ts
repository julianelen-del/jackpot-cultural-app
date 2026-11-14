import { GoogleGenAI, Type } from "@google/genai";
import type { CountryEdition, CountrySourceConfig } from "../../src/lib/schema";
import { fetchWikimediaCoverImage } from "./fetch-image";
import {
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

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-4-hydrogen";

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
    // Si falló por usar la herramienta googleSearch en plan gratuito, no reintentar search en otro modelo
    if (config.tools) {
      throw err;
    }
    if (
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("not found") ||
      msg.includes("404")
    ) {
      console.warn(
        `  [Modelo] Reintentando con ${FALLBACK_MODEL} tras aviso en ${PRIMARY_MODEL}...`
      );
      await sleep(2000);
      return await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents,
        config,
      });
    }
    throw err;
  }
}

export async function generateCountryEdition(
  ai: GoogleGenAI,
  country: CountrySourceConfig,
  previousTopics: string[]
): Promise<CountryEdition> {
  const weekLabel = getCurrentIsoWeek();

  // 1. Capturar RSS públicos curados
  let rssSignals = await fetchCountryRssSignals(country.rss_feeds);

  const formatSignals = (signals: typeof rssSignals) =>
    signals
      .map(
        (s) =>
          `- [${s.sourceTitle}] ${s.title}${s.snippet ? `: ${s.snippet}` : ""} (${s.url})`
      )
      .join("\n");

  let researchDossier = "";
  const candidateUrls: CandidateUrl[] = [];

  // 2. Paso 1: Intentar Google Search Grounding (salvo que ya sepamos que está bloqueado en esta sesión)
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
        "  [Plan B gratuito] Google Search no disponible en Nivel Gratuito. Activando Google News RSS + feeds abiertos para la sesión."
      );
    }
  }

  // Si Google Search no estuvo disponible o trajo pocos enlaces, usamos Google News RSS del país
  if (!searchSucceeded || candidateUrls.length < 2) {
    const newsSignals = await fetchGoogleNewsCulturalSignals(
      country.slug,
      country.country
    );
    rssSignals = [...rssSignals, ...newsSignals].slice(0, 22);

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
  }

  if (researchDossier.length < 200) {
    throw new Error("El dossier de investigación devolvió contenido insuficiente.");
  }

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

  // 3. Paso 2: Redacción estructurada en JSON (con hasta 2 intentos por Quality Gate)
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const synthesisPrompt =
      buildSynthesisPrompt(country, researchDossier, verifiedUrls, weekLabel) +
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
            required: ["type", "title", "creator", "context", "url"],
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
              url: { type: Type.STRING },
            },
          },
          sources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["name", "url", "paywalled"],
              properties: {
                name: { type: Type.STRING },
                url: { type: Type.STRING },
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

    const visualQuery =
      typeof parsedJson.visual_query === "string"
        ? parsedJson.visual_query
        : country.country;
    const visualCaption =
      typeof parsedJson.visual_caption === "string"
        ? parsedJson.visual_caption
        : `Escena cultural en ${country.country}.`;

    delete parsedJson.visual_query;
    delete parsedJson.visual_caption;

    const coverImage = await fetchWikimediaCoverImage(visualQuery, visualCaption);

    const assembled = {
      slug: country.slug,
      country: country.country,
      continent: country.continent,
      flag: country.flag,
      updated_at: new Date().toISOString(),
      edition_week: weekLabel,
      ...(coverImage ? { cover_image: coverImage } : {}),
      ...parsedJson,
    };

    const verdict = validateEditionQuality(assembled, allowedUrlSet);
    if (verdict.ok) {
      return verdict.data;
    }

    lastError = verdict.reason;
    console.warn(`  [Reintento ${attempt}] ${country.country}: ${lastError}`);
  }

  throw new Error(`Falló Quality Gate tras 2 intentos: ${lastError}`);
}