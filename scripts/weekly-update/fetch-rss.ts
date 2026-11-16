import Parser from "rss-parser";

const parser = new Parser({
  timeout: 6500,
  customFields: {
    item: [["media:group", "mediaGroup"]],
  },
  headers: {
    "User-Agent": "JackpotCulturalBot/1.0 (+https://github.com)",
    Accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

export interface ExternalRefLink {
  label: string;
  url: string;
}

export interface RssSignal {
  sourceTitle: string;
  title: string;
  snippet: string;
  url: string;
  pubDate?: string;
  youtubeUrl?: string;
  externalLinks?: ExternalRefLink[];
}

const GOOGLE_NEWS_LOCALE: Record<
  string,
  { hl: string; gl: string; ceid: string; queryTerm: string }
> = {
  argentina: {
    hl: "es-419",
    gl: "AR",
    ceid: "AR:es-419",
    queryTerm: "(musica OR rock OR indie OR cine OR series OR libros OR literatura OR historieta)",
  },
  brasil: {
    hl: "pt-BR",
    gl: "BR",
    ceid: "BR:pt-419",
    queryTerm: "(musica OR rock OR indie OR cinema OR series OR livros OR literatura OR quadrinhos)",
  },
  mexico: {
    hl: "es-419",
    gl: "MX",
    ceid: "MX:es-419",
    queryTerm: "(musica OR rock OR indie OR cine OR series OR libros OR literatura OR comic)",
  },
  "estados-unidos": {
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
    queryTerm: "(music OR rock OR indie OR film OR cinema OR series OR television OR books OR comics)",
  },
  canada: {
    hl: "en-CA",
    gl: "CA",
    ceid: "CA:en",
    queryTerm: "(music OR rock OR indie OR film OR television OR series OR books OR comics)",
  },
  chile: {
    hl: "es-419",
    gl: "CL",
    ceid: "CL:es-419",
    queryTerm: "(musica OR rock OR indie OR cine OR series OR libros OR literatura OR comic)",
  },
  colombia: {
    hl: "es-419",
    gl: "CO",
    ceid: "CO:es-419",
    queryTerm: "(musica OR rock OR indie OR cine OR series OR libros OR literatura OR comic)",
  },
  "reino-unido": {
    hl: "en-GB",
    gl: "GB",
    ceid: "GB:en",
    queryTerm: "(music OR rock OR indie OR film OR cinema OR television OR series OR books OR theatre)",
  },
  irlanda: {
    hl: "en-IE",
    gl: "IE",
    ceid: "IE:en",
    queryTerm: "(music OR rock OR indie OR film OR television OR series OR books OR theatre)",
  },
  espana: {
    hl: "es",
    gl: "ES",
    ceid: "ES:es",
    queryTerm: "(musica OR rock OR indie OR cine OR series OR libros OR literatura OR comic)",
  },
  francia: {
    hl: "fr",
    gl: "FR",
    ceid: "FR:fr",
    queryTerm: '(musique OR rock OR indie OR cinéma OR séries OR livres OR littérature OR "bande dessinée")',
  },
  alemania: {
    hl: "de",
    gl: "DE",
    ceid: "DE:de",
    queryTerm: "(musik OR rock OR indie OR kino OR film OR serien OR bücher OR literatur OR comic)",
  },
  italia: {
    hl: "it",
    gl: "IT",
    ceid: "IT:it",
    queryTerm: "(musica OR rock OR indie OR cinema OR serie OR libri OR letteratura OR fumetti)",
  },
  suecia: {
    hl: "sv",
    gl: "SE",
    ceid: "SE:sv",
    queryTerm: "(musik OR rock OR indie OR film OR serier OR böcker OR litteratur OR teater)",
  },
  rusia: {
    hl: "en",
    gl: "US",
    ceid: "US:en",
    queryTerm: "(Russia OR Russian) (music OR rock OR cinema OR film OR series OR books OR literature OR theater)",
  },
  "paises-bajos": {
    hl: "nl",
    gl: "NL",
    ceid: "NL:nl",
    queryTerm: "(muziek OR rock OR indie OR film OR series OR boeken OR literatuur)",
  },
  japon: {
    hl: "en",
    gl: "JP",
    ceid: "JP:en",
    queryTerm: "Japan (music OR rock OR indie OR cinema OR film OR anime OR manga OR series OR books)",
  },
  "corea-del-sur": {
    hl: "en",
    gl: "KR",
    ceid: "KR:en",
    queryTerm: "(Korea OR Korean) (music OR indie OR rock OR cinema OR film OR series OR drama OR books OR webtoon)",
  },
  india: {
    hl: "en-IN",
    gl: "IN",
    ceid: "IN:en",
    queryTerm: "(music OR rock OR indie OR cinema OR film OR series OR streaming OR books OR literature)",
  },
  sudafrica: {
    hl: "en-ZA",
    gl: "ZA",
    ceid: "ZA:en",
    queryTerm: "(music OR rock OR indie OR film OR cinema OR series OR books OR literature OR arts)",
  },
  egipto: {
    hl: "en-EG",
    gl: "EG",
    ceid: "EG:en",
    queryTerm: "Egypt (music OR cinema OR film OR series OR books OR literature OR art)",
  },
  australia: {
    hl: "en-AU",
    gl: "AU",
    ceid: "AU:en",
    queryTerm: "(music OR rock OR indie OR film OR cinema OR television OR series OR books)",
  },
  "nueva-zelanda": {
    hl: "en-NZ",
    gl: "NZ",
    ceid: "NZ:en",
    queryTerm: "(music OR rock OR indie OR film OR cinema OR television OR series OR books)",
  },
};

const BLOCKED_EXTERNAL_DOMAINS = [
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "whatsapp.com",
  "t.me",
  "linkedin.com",
  "pinterest.com",
  "doubleclick.net",
  "googlesyndication.com",
  "googletagmanager.com",
  "apple.com/podcast",
  "podcasts.apple.com",
  "gravatar.com",
];

const GENERIC_LINK_LABELS = [
  "leer más",
  "ver más",
  "aquí",
  "acá",
  "click",
  "link",
  "enlace",
  "read more",
  "here",
  "source",
  "fuente",
];

function findYouTubeInHtml(rawHtml: string): string | undefined {
  const regex =
    /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
  const match = rawHtml.match(regex);
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

function extractExternalLinksFromParagraphs(
  paragraphHtml: string,
  articleHost: string
): ExternalRefLink[] {
  const found: ExternalRefLink[] = [];
  const seen = new Set<string>();
  const aRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const m of paragraphHtml.matchAll(aRegex)) {
    const href = m[1].trim();
    const label = m[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (label.length < 3 || label.length > 60) continue;
    if (GENERIC_LINK_LABELS.includes(label.toLowerCase())) continue;

    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const ownHost = articleHost.replace(/^www\./, "").toLowerCase();
      if (host === ownHost) continue;
      if (BLOCKED_EXTERNAL_DOMAINS.some((b) => host.includes(b))) continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(u.pathname)) continue;
      if (seen.has(href)) continue;

      seen.add(href);
      found.push({ label, url: href });
      if (found.length >= 3) break;
    } catch {
      continue;
    }
  }

  return found;
}

async function fetchOpenArticleContext(url: string): Promise<{
  text: string;
  externalLinks: ExternalRefLink[];
  youtubeUrl?: string;
}> {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.includes("news.google.com") ||
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtu.be")
    ) {
      return { text: "", externalLinks: [] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JackpotCulturalBot/1.0)",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return { text: "", externalLinks: [] };
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return { text: "", externalLinks: [] };
    }

    const html = (await res.text()).slice(0, 65000);
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");

    const embeddedYoutube = findYouTubeInHtml(cleaned);

    const paragraphs: string[] = [];
    const collectedLinks: ExternalRefLink[] = [];
    const pMatches = cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);

    for (const m of pMatches) {
      const innerHtml = m[1];
      const txt = innerHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      if (txt.length >= 60) {
        paragraphs.push(txt);
        if (collectedLinks.length < 3) {
          const ext = extractExternalLinksFromParagraphs(
            innerHtml,
            parsed.hostname
          );
          for (const item of ext) {
            if (
              collectedLinks.length < 3 &&
              !collectedLinks.some((c) => c.url === item.url)
            ) {
              collectedLinks.push(item);
            }
          }
        }
      }
      if (paragraphs.length >= 4) break;
    }

    return {
      text: paragraphs.join(" ").slice(0, 950),
      externalLinks: collectedLinks,
      youtubeUrl: embeddedYoutube,
    };
  } catch {
    return { text: "", externalLinks: [] };
  }
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

      const rawDate = item.pubDate || item.isoDate;
      const itemTime = rawDate ? Date.parse(rawDate) : NaN;
      if (!Number.isNaN(itemTime) && itemTime < tenDaysAgo) {
        continue;
      }

      const mediaDesc = extractMediaDescription(item);
      const rawHtml = [
        link,
        item.content || "",
        item.summary || "",
        item.contentSnippet || "",
        mediaDesc,
      ].join(" ");
      const youtubeUrl = findYouTubeInHtml(rawHtml);

      let host = "";
      try {
        host = new URL(link).hostname;
      } catch {
        host = "";
      }
      const rssExtLinks = host
        ? extractExternalLinksFromParagraphs(
            `${item.content || ""} ${item.summary || ""}`,
            host
          )
        : [];

      const rawSnippet =
        item.contentSnippet || item.summary || item.content || mediaDesc || "";
      const cleanSnippet = rawSnippet
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 850);

      signals.push({
        sourceTitle,
        title,
        snippet: cleanSnippet,
        url: link,
        pubDate: rawDate,
        youtubeUrl,
        externalLinks: rssExtLinks,
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("  [RSS aviso] No se pudo leer " + feedUrl + ": " + msg);
  }

  return signals;
}

export function balanceSignalsBySource(
  signals: RssSignal[],
  maxPerSource = 3,
  maxTotal = 24
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

export async function enrichSignalsWithArticleContext(
  signals: RssSignal[]
): Promise<RssSignal[]> {
  const indicesToFetch: number[] = [];

  signals.forEach((sig, idx) => {
    if (indicesToFetch.length >= 12) return;
    const needsText = sig.snippet.length < 300;
    const needsLinks = !sig.externalLinks || sig.externalLinks.length === 0;
    const needsVideo = !sig.youtubeUrl;
    if (needsText || needsLinks || needsVideo) {
      indicesToFetch.push(idx);
    }
  });

  const fetchedResults = await Promise.all(
    indicesToFetch.map(async (idx) => ({
      idx,
      res: await fetchOpenArticleContext(signals[idx].url),
    }))
  );

  const byIndex = new Map(fetchedResults.map((item) => [item.idx, item.res]));

  return signals.map((sig, idx) => {
    const extra = byIndex.get(idx);
    if (!extra) return sig;
    return {
      ...sig,
      snippet: extra.text.length > sig.snippet.length ? extra.text : sig.snippet,
      externalLinks:
        sig.externalLinks && sig.externalLinks.length > 0
          ? sig.externalLinks
          : extra.externalLinks,
      youtubeUrl: sig.youtubeUrl || extra.youtubeUrl,
    };
  });
}

export async function fetchCountryRssSignals(
  feedUrls: string[]
): Promise<RssSignal[]> {
  if (!feedUrls.length) return [];
  const results = await Promise.all(
    feedUrls.map((url) => parseSingleFeed(url, 6))
  );
  return balanceSignalsBySource(results.flat(), 3, 26);
}

export async function fetchGoogleNewsCulturalSignals(
  slug: string,
  countryName: string
): Promise<RssSignal[]> {
  const cfg = GOOGLE_NEWS_LOCALE[slug] || {
    hl: "en",
    gl: "US",
    ceid: "US:en",
    queryTerm: `${countryName} (culture OR music OR rock OR film OR series OR books)`,
  };

  const query = encodeURIComponent(cfg.queryTerm + " when:7d");
  const url =
    "https://news.google.com/rss/search?q=" +
    query +
    "&hl=" +
    cfg.hl +
    "&gl=" +
    cfg.gl +
    "&ceid=" +
    cfg.ceid;

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