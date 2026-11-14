import { GoogleGenAI, Type } from "@google/genai";
import type { CountryEdition, CountrySourceConfig } from "../../src/lib/schema";
import { fetchCountryRssSignals } from "./fetch-rss";
import {
  buildResearchPrompt,
  buildSynthesisPrompt,
  EDITORIAL_SYSTEM_INSTRUCTION,
} from "./prompts";
import { validateEditionQuality } from "./quality-gate";
import { verifyCandidateUrls, type CandidateUrl } from "./verify-links";

const MODEL_ID = process.env.GEMINI_MODEL || "gemini-3.8-flash";

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

export async function generateCountryEdition(
  ai: GoogleGenAI,
  country: CountrySourceConfig,
  previousTopics: string[]
): Promise<CountryEdition> {
  const weekLabel = getCurrentIsoWeek();

  // 1. Capturar RSS públicos recientes (si existen)
  const rssSignals = await fetchCountryRssSignals(country.rss_feeds);
  const rssContext = rssSignals
    .map(
      (s) =>
        `- [${s.sourceTitle}] ${s.title}${s.snippet ? `: ${s.snippet}` : ""} (${s.url})`
    )
    .join("\n");

  // 2. Paso 1: Investigación con Google Search Grounding
  const researchPrompt = buildResearchPrompt(
    country,
    rssContext,
    previousTopics,
    weekLabel
  );

  const researchResponse = await ai.models.generateContent({
    model: MODEL_ID,
    contents: researchPrompt,
    config: {
      systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
      temperature: 0.4,
      tools: [{ googleSearch: {} }],
    },
  });

  const researchDossier = researchResponse.text?.trim();
  if (!researchDossier || researchDossier.length < 200) {
    throw new Error("El dossier de investigación devolvió contenido insuficiente.");
  }

  // Extraer URLs reales descubiertas por Google Search Grounding + RSS
  const candidateUrls: CandidateUrl[] = [];
  const groundingChunks =
    researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  for (const chunk of groundingChunks) {
    if (chunk.web?.uri) {
      candidateUrls.push({
        title: chunk.web.title || "Fuente cultural",
        url: chunk.web.uri,
      });
    }
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

    const jsonResponse = await ai.models.generateContent({
      model: MODEL_ID,
      contents: synthesisPrompt,
      config: {
        systemInstruction: EDITORIAL_SYSTEM_INSTRUCTION,
        temperature: 0.65,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: [
            "intro",
            "cultural_pulse",
            "topics",
            "recommendation",
            "sources",
          ],
          properties: {
            intro: { type: Type.STRING },
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

    const assembled = {
      slug: country.slug,
      country: country.country,
      continent: country.continent,
      flag: country.flag,
      updated_at: new Date().toISOString(),
      edition_week: weekLabel,
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