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

export async function fetchCountryRssSignals(
  feedUrls: string[]
): Promise<RssSignal[]> {
  if (!feedUrls.length) return [];

  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const signals: RssSignal[] = [];

  for (const feedUrl of feedUrls) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const sourceTitle = feed.title?.trim() || new URL(feedUrl).hostname;

      for (const item of (feed.items || []).slice(0, 12)) {
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
  }

  return signals.slice(0, 18);
}