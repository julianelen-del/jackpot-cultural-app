import Parser from "rss-parser";

const parser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "JackpotCulturalBot/1.0 (+https://github.com)",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

export interface RssSignal {
  sourceTitle: string;
  title: string;
  snippet: string;
  url: string;
  pubDate?: string;
}

const GOOGLE_NEWS_LOCALE: Record<string, { hl: string; gl: string; ceid: string; queryTerm: string }> = {
  argentina: { hl: "es-419", gl: "AR", ceid: "AR:es-419", queryTerm: "cultura literatura cine teatro arte" },
  brasil: { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419", queryTerm: "cultura literatura cinema teatro arte" },
  mexico: { hl: "es-419", gl: "MX", ceid: "MX:es-419", queryTerm: "cultura literatura cine teatro arte" },
  "estados-unidos": { hl: "en-US", gl: "US", ceid: "US:en", queryTerm: "culture books film theater art museum" },
  canada: { hl: "en-CA", gl: "CA", ceid: "CA:en", queryTerm: "arts culture books film theater" },
  chile: { hl: "es-419", gl: "CL", ceid: "CL:es-419", queryTerm: "cultura literatura cine teatro arte" },
  colombia: { hl: "es-419", gl: "CO", ceid: "CO:es-419", queryTerm: "cultura literatura cine teatro arte" },
  "reino-unido": { hl: "en-GB", gl: "GB", ceid: "GB:en", queryTerm: "culture books film theatre exhibition" },
  irlanda: { hl: "en-IE", gl: "IE", ceid: "IE:en", queryTerm: "irish culture books film theatre arts" },
  espana: { hl: "es", gl: "ES", ceid: "ES:es", queryTerm: "cultura literatura cine teatro exposiciones" },
  francia: { hl: "fr", gl: "FR", ceid: "FR:fr", queryTerm: "culture littérature cinéma théâtre exposition" },
  alemania: { hl: "de", gl: "DE", ceid: "DE:de", queryTerm: "kultur literatur kino theater ausstellung" },
  italia: { hl: "it", gl: "IT", ceid: "IT:it", queryTerm: "cultura libri cinema teatro mostra" },
  suecia: { hl: "sv", gl: "SE", ceid: "SE:sv", queryTerm: "kultur böcker film teater konst" },
  rusia: { hl: "en", gl: "US", ceid: "US:en", queryTerm: "Russia culture literature cinema theater art" },
  "paises-bajos": { hl: "nl", gl: "NL", ceid: "NL:nl", queryTerm: "cultuur literatuur film theater museum" },
  japon: { hl: "en", gl: "JP", ceid: "JP:en", queryTerm: "Japan culture art cinema literature exhibition" },
  "corea-del-sur": { hl: "en", gl: "KR", ceid: "KR:en", queryTerm: "South Korea culture cinema literature art" },
  india: { hl: "en-IN", gl: "IN", ceid: "IN:en", queryTerm: "India culture books cinema art theatre" },
  sudafrica: { hl: "en-ZA", gl: "ZA", ceid: "ZA:en", queryTerm: "South Africa arts culture books film" },
  egipto: { hl: "en-EG", gl: "EG", ceid: "EG:en", queryTerm: "Egypt culture arts cinema literature" },
  australia: { hl: "en-AU", gl: "AU", ceid: "AU:en", queryTerm: "Australia arts culture books film theatre" },
  "nueva-zelanda": { hl: "en-NZ", gl: "NZ", ceid: "NZ:en", queryTerm: "New Zealand arts culture books film" },
};

async function parseSingleFeed(feedUrl: string, limit = 12): Promise<RssSignal[]> {
  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const signals: RssSignal[] = [];

  try {
    const feed = await parser.parseURL(feedUrl);
    const sourceTitle = feed.title?.trim() || new URL(feedUrl).hostname;

    for (const item of (feed.items || []).slice(0, limit)) {
      const title = item.title?.trim();
      const link = item.link?.trim();
      if (!title || !link) continue;

      const itemTime = item.pubDate ? Date.parse(item.pubDate) : NaN;
      if (!Number.isNaN(itemTime) && itemTime < eightDaysAgo) {
        continue;
      }

      const rawSnippet =
        item.contentSnippet || item.summary || item.content || "";
      const cleanSnippet = rawSnippet
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);

      signals.push({
        sourceTitle,
        title,
        snippet: cleanSnippet,
        url: link,
        pubDate: item.pubDate,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`  [RSS aviso] No se pudo leer ${feedUrl}: ${msg}`);
  }

  return signals;
}

export async function fetchCountryRssSignals(
  feedUrls: string[]
): Promise<RssSignal[]> {
  const all: RssSignal[] = [];
  for (const url of feedUrls) {
    const items = await parseSingleFeed(url, 12);
    all.push(...items);
  }
  return all.slice(0, 18);
}

export async function fetchGoogleNewsCulturalSignals(
  slug: string,
  countryName: string
): Promise<RssSignal[]> {
  const cfg = GOOGLE_NEWS_LOCALE[slug] || {
    hl: "en",
    gl: "US",
    ceid: "US:en",
    queryTerm: `${countryName} culture arts literature cinema`,
  };

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${cfg.queryTerm} when:7d`
  )}&hl=${cfg.hl}&gl=${cfg.gl}&ceid=${cfg.ceid}`;

  const rawSignals = await parseSingleFeed(url, 16);
  // Google News incluye "Titular - Nombre del Medio": limpiamos el nombre del medio
  return rawSignals.map((sig) => {
    const parts = sig.title.split(" - ");
    const mediaName =
      parts.length > 1 ? parts[parts.length - 1].trim() : "Prensa cultural";
    return {
      ...sig,
      sourceTitle: mediaName,
    };
  });
}