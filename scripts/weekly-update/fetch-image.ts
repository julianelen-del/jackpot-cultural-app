import type { CoverImage } from "../../src/lib/schema";

interface WikimediaPage {
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: {
      Artist?: { value?: string };
      LicenseShortName?: { value?: string };
    };
  }>;
}

function cleanHtml(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchWikimediaCoverImage(
  query: string,
  caption: string
): Promise<CoverImage | undefined> {
  if (!query || query.trim().length < 3) return undefined;

  try {
    const endpoint =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrnamespace: "6",
        gsrsearch: query.trim(),
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata",
        iiurlwidth: "1280",
        format: "json",
        origin: "*",
      }).toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "JackpotCulturalBot/1.0 (https://github.com)",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, WikimediaPage> };
    };

    const pages = Object.values(data.query?.pages || {});
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) continue;

      const width = info.width || 0;
      const height = info.height || 0;
      // Solo fotos apaisadas (horizontales) de buena resolución
      if (width < 800 || height < 450 || width <= height) continue;

      const imageUrl = info.thumburl || info.url;
      if (!imageUrl) continue;

      const artist = cleanHtml(info.extmetadata?.Artist?.value).slice(0, 55);
      const license = cleanHtml(
        info.extmetadata?.LicenseShortName?.value
      ).slice(0, 35);

      const creditParts = [artist, license || "Wikimedia Commons"].filter(
        Boolean
      );

      return {
        url: imageUrl,
        caption: caption.trim().slice(0, 195),
        credit: `Foto: ${creditParts.join(" · ")}`.slice(0, 138),
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}