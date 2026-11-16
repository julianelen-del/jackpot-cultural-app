export interface CandidateUrl {
  title: string;
  url: string;
}

async function resolveAndCheckUrl(rawUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;

    if (parsed.hostname === "news.google.com") {
      return rawUrl;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    let response = await fetch(rawUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JackpotCulturalVerifier/1.0)",
      },
    }).catch(() => null);

    if (!response || response.status === 405 || response.status === 403) {
      response = await fetch(rawUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; JackpotCulturalVerifier/1.0)",
        },
      }).catch(() => null);
    }

    clearTimeout(timer);

    if (!response) return null;
    if (
      response.status >= 400 &&
      response.status !== 403 &&
      response.status !== 401
    ) {
      return null;
    }

    const finalUrl = response.url || rawUrl;
    if (finalUrl.includes("vertexaisearch.cloud.google.com")) {
      return null;
    }

    return finalUrl;
  } catch {
    return null;
  }
}

export async function verifyCandidateUrls(
  candidates: CandidateUrl[]
): Promise<CandidateUrl[]> {
  const seen = new Set<string>();
  const verified: CandidateUrl[] = [];
  const CHUNK_SIZE = 8;

  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const batch = candidates.slice(i, i + CHUNK_SIZE);
    const resolvedBatch = await Promise.all(
      batch.map(async (item) => ({
        item,
        resolved: await resolveAndCheckUrl(item.url),
      }))
    );

    for (const { item, resolved } of resolvedBatch) {
      if (!resolved) continue;
      const normalized = resolved.split("#")[0];
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      verified.push({
        title: item.title.trim() || new URL(normalized).hostname,
        url: normalized,
      });
    }
  }

  return verified;
}