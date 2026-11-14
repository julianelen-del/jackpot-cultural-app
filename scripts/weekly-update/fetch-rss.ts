```typescript
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [["media:group", "mediaGroup"]],
  },
  headers: {
    "User-Agent": "JackpotCulturalBot/1.0 (+https://github.com)",
    Accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

export interface RssSignal {
  sourceTitle: string;
  title: string;
  snippet: string;
  url: string;
  pubDate?: string;
  youtubeUrl?: string;
}

const GOOGLE_NEWS_LOCALE: Record<
  string,
  { hl: string; gl: string; ceid: string; queryTerm: string }
> = {
  argentina: { hl: "es-419", gl: "AR", ceid: "AR:es-419", queryTerm: "cultura musica rock cine series literatura" },
  brasil: { hl: "pt-BR", gl: "BR", ceid: "BR:pt-419", queryTerm: "cultura musica rock cinema series literatura" },
  mexico: { hl: "es-419", gl: "MX", ceid: "MX:es-419", queryTerm: "cultura musica rock cine series literatura" },
  "estados-unidos": { hl: "en-US", gl: "US", ceid: "US:en", queryTerm: "culture music rock film television books art" },
  canada: { hl: "en-CA", gl: "CA", ceid: "CA:en", queryTerm: "arts culture music film television books" },
  chile: { hl: "es-419", gl: "CL", ceid: "CL:es-419", queryTerm: "cultura musica rock cine series literatura" },
  colombia: { hl: "es-419", gl: "CO", ceid: "CO:es-419", queryTerm: "cultura musica rock cine series literatura" },
  "reino-unido": { hl: "en-GB", gl: "GB", ceid: "GB:en", queryTerm: "culture music rock film television books theatre" },
  irlanda: { hl: "en-IE", gl: "IE", ceid: "IE:en", queryTerm: "irish culture music film television books theatre" },
  espana: { hl: "es", gl: "ES", ceid: "ES:es", queryTerm: "cultura musica rock cine series literatura" },
  francia: { hl: "fr", gl: "FR", ceid: "FR:fr", queryTerm: "culture musique rock cinéma séries littérature" },
  alemania: { hl: "de", gl: "DE", ceid: "DE:de", queryTerm: "kultur musik rock kino serien literatur" },
  italia: { hl: "it", gl: "IT", ceid: "IT:it", queryTerm: "cultura musica rock cinema serie libri" },
  suecia: { hl: "sv", gl: "SE", ceid: "SE:sv", queryTerm: "kultur musik film serier böcker teater" },
  rusia: { hl: "en", gl: "US", ceid: "US:en", queryTerm: "Russia culture music cinema literature theater art" },
  "paises-bajos": { hl: "nl", gl: "NL", ceid: "NL:nl", queryTerm: "cultuur muziek film series literatuur" },
  japon: { hl: "en", gl: "JP", ceid: "JP:en", queryTerm: "Japan culture music anime cinema literature art" },
  "corea-del-sur": { hl: "en", gl: "KR", ceid: "KR:en", queryTerm: "South Korea culture music cinema drama literature" },
  india: { hl: "en-IN", gl: "IN", ceid: "IN:en", queryTerm: "India culture music cinema streaming books art" },
  sudafrica: { hl: "en-ZA", gl: "ZA", ceid: "ZA:en", queryTerm: "South Africa music culture film books arts" },
  egipto: { hl: "en-EG", gl: "EG", ceid: "EG:en", queryTerm: "Egypt culture music cinema literature arts" },
  australia: { hl: "en-AU", gl: "AU", ceid: "AU:en", queryTerm: "Australia music rock culture film television books" },
  "nueva-zelanda": { hl: "en-NZ", gl: "NZ", ceid: "NZ:en", queryTerm: "New Zealand music culture film television books" },
};

function findYouTubeInHtml(rawHtml: string): string | undefined {
  const match = rawHtml.match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : undefined;
}

function extractMediaDescription(item: unknown): string {
  const record = item as Record<string, unknown>;
  const mediaGroup = record.mediaGroup as
    | { "media:description"?: Array<string | { _?: string }> }
    | undefined;
  const raw = mediaGroup?.["media:description"]?.[0];
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw._ === "string") return raw._;
  return "";
}

async function parseSingleFeed(feedUrl: string, limit = 8): Promise<RssSignal[]> {
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const signals: RssSignal[] = [];

  try {
    const feed = await parser.parseURL(feedUrl);
    const sourceTitle = feed.title?.trim() || new URL(feedUrl).hostname;

    for (const item of (feed.items || []).slice(0, limit)) {
      const title = item.title?.trim();
      const link = item.link?.trim();
      if (!title || !link) continue;

      const itemTime = item.pubDate ? Date.parse(item.pubDate) : NaN;
      if (!Number.isNaN(itemTime) && itemTime < tenDaysAgo) {
        continue;
      }

      const mediaDesc = extractMediaDescription(item);
      const rawHtml = `${link} ${item.content || ""} ${item.summary || ""} ${item.contentSnippet || ""} ${mediaDesc}`;
      const youtubeUrl = findYouTubeInHtml(rawHtml);

      const rawSnippet =
        item.contentSnippet || item.summary || item.content || mediaDesc || "";
      const cleanSnippet = rawSnippet
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 480);

      signals.push({
        sourceTitle,
        title,
        snippet: cleanSnippet,
        url: link,
        pubDate: item.pubDate,
        youtubeUrl,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`  [RSS aviso] No se pudo leer ${feedUrl}: ${msg}`);
  }

  return signals;
}

export function balanceSignalsBySource(
  signals: RssSignal[],
  maxPerSource = 3,
  maxTotal = 26
): RssSignal[] {
  const buckets = new Map<string, RssSignal[]>();
  for (const sig of signals) {
    const key = sig.sourceTitle.toLowerCase().trim();
    const list = buckets.get(key) || [];
    if (list.length < maxPerSource) {
      list.push(sig);
      buckets.set(key, list);
    }
  }

  const balanced: RssSignal[] = [];
  let round = 0;
  while (balanced.length < maxTotal) {
    let addedInRound = false;
    for (const list of buckets.values()) {
      if (round < list.length) {
        balanced.push(list[round]);
        addedInRound = true;
        if (balanced.length >= maxTotal) break;
      }
    }
    if (!addedInRound) break;
    round++;
  }

  return balanced;
}

export async function fetchCountryRssSignals(
  feedUrls: string[]
): Promise<RssSignal[]> {
  const all: RssSignal[] = [];
  for (const url of feedUrls) {
    const items = await parseSingleFeed(url, 6);
    all.push(...items);
  }
  return balanceSignalsBySource(all, 3, 22);
}

export async function fetchGoogleNewsCulturalSignals(
  slug: string,
  countryName: string
): Promise<RssSignal[]> {
  const cfg = GOOGLE_NEWS_LOCALE[slug] || {
    hl: "en",
    gl: "US",
    ceid: "US:en",
    queryTerm: `${countryName} culture music film books`,
  };

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${cfg.queryTerm} when:7d`
  )}&hl=${cfg.hl}&gl=${cfg.gl}&ceid=${cfg.ceid}`;

  const rawSignals = await parseSingleFeed(url, 16);
  const cleaned = rawSignals.map((sig) => {
    const parts = sig.title.split(" - ");
    const mediaName =
      parts.length > 1 ? parts[parts.length - 1].trim() : "Prensa cultural";
    return {
      ...sig,
      sourceTitle: mediaName,
    };
  });

  return balanceSignalsBySource(cleaned, 2, 16);
}
