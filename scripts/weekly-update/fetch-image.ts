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

const EXCLUDED_IMAGE_TERMS = [
  "map",
  "logo",
  "flag",
  "coat of arms",
  "diagram",
  "chart",
  "signature",
  "seal",
  "emblem",
  "locator",
];

function cleanHtml(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchWikimediaCoverImage(
  query: string,
  caption: string,
  excludeUrl?: string
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
        gsrlimit: "10",
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
      const titleLower = (page.title || "").toLowerCase();
      if (EXCLUDED_IMAGE_TERMS.some((term) => titleLower.includes(term))) {
        continue;
      }

      const info = page.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) continue;

      const width = info.width || 0;
      const height = info.height || 0;
      if (width < 800 || height < 450 || width <= height) continue;

      const imageUrl = info.thumburl || info.url;
      if (!imageUrl || imageUrl === excludeUrl) continue;

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

export function extractYouTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    let videoId = "";

    if (parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.slice(1).split("/")[0];
    } else if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] || "";
      }
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return null;
  }
}

export async function verifyYouTubeOEmbed(rawUrl: string): Promise<string | null> {
  const embedUrl = extractYouTubeEmbedUrl(rawUrl);
  if (!embedUrl) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    return res.ok ? embedUrl : null;
  } catch {
    return null;
  }
}