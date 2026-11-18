import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import {
  CountryEditionSchema,
  type CountryEdition,
  type CountrySourceConfig,
} from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const STATE_PATH = path.join(process.cwd(), "content", "social-state.json");
const GRAPH_BASE = "https://graph.facebook.com/v27.0";
const THREADS_BASE = "https://graph.threads.net/v1.0";
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://jackpot-cultural-app.vercel.app"
).replace(/\/+$/, "");

interface SocialPostRecord {
  publishedAt: string;
  facebookPostId?: string;
  instagramMediaId?: string;
  instagramMode?: "carousel" | "single";
  threadsPostId?: string;
  xTweetId?: string;
}

interface SocialState {
  week: string;
  published: Record<string, SocialPostRecord>;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadState(targetWeek: string): SocialState {
  if (!fs.existsSync(STATE_PATH)) {
    return { week: targetWeek, published: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as SocialState;
    if (raw.week !== targetWeek) {
      return { week: targetWeek, published: {} };
    }
    return { week: raw.week, published: raw.published || {} };
  } catch {
    return { week: targetWeek, published: {} };
  }
}

function saveState(state: SocialState) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function loadEditions(): CountryEdition[] {
  const configs = JSON.parse(
    fs.readFileSync(SOURCES_PATH, "utf-8")
  ) as CountrySourceConfig[];

  const editions: CountryEdition[] = [];
  for (const cfg of configs) {
    const filePath = path.join(COUNTRIES_DIR, `${cfg.slug}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const parsed = CountryEditionSchema.safeParse(raw);
      if (parsed.success) editions.push(parsed.data);
    } catch {
      // Ignorar archivo corrupto
    }
  }
  return editions;
}

function pickLatestWeek(editions: CountryEdition[]): string {
  const counts = new Map<string, number>();
  for (const ed of editions) {
    counts.set(ed.edition_week, (counts.get(ed.edition_week) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  );
  return sorted[0]?.[0] || "";
}

async function isPublicJpeg(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const ct = res.headers.get("content-type") || "";
    return res.ok && ct.includes("jpeg");
  } catch {
    return false;
  }
}

async function resolvePublicJpegUrl(edition: CountryEdition): Promise<string | null> {
  const cardUrl = `${SITE_URL}/social-cards/${edition.slug}.jpg`;
  if (await isPublicJpeg(cardUrl)) return cardUrl;

  const cover = edition.cover_image?.url;
  if (cover && /\.(jpe?g)(\?|$)/i.test(cover)) {
    return cover;
  }
  return null;
}

async function resolveCarouselUrls(
  edition: CountryEdition
): Promise<string[] | null> {
  const urls = [
    `${SITE_URL}/social-cards/${edition.slug}-1.jpg`,
    `${SITE_URL}/social-cards/${edition.slug}-2.jpg`,
    `${SITE_URL}/social-cards/${edition.slug}-3.jpg`,
  ];
  const checks = await Promise.all(urls.map((u) => isPublicJpeg(u)));
  return checks.every(Boolean) ? urls : null;
}

function buildFacebookCaption(edition: CountryEdition): string {
  const intro = stripMarkdown(edition.intro);
  const bullets = edition.topics
    .slice(0, 3)
    .map((t) => `• ${stripMarkdown(t.title)}`)
    .join("\n");
  const pageUrl = `${SITE_URL}/pais/${edition.slug}`;

  return [
    `${edition.flag} ${edition.country} — Edición ${edition.edition_week}`,
    "",
    intro,
    "",
    "En esta edición:",
    bullets,
    "",
    `Para descubrir: ${edition.recommendation.title} (${edition.recommendation.creator})`,
    "",
    `Leé la edición completa y escuchá radios locales en: ${pageUrl}`,
  ].join("\n");
}

function buildInstagramCaption(
  edition: CountryEdition,
  isCarousel: boolean
): string {
  const intro = stripMarkdown(edition.intro);
  const bullets = edition.topics
    .slice(0, 3)
    .map((t) => `• ${stripMarkdown(t.title)}`)
    .join("\n");
  const countryTag = edition.country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  return [
    `${edition.flag} ${edition.country.toUpperCase()} · ${edition.edition_week}`,
    "",
    intro,
    ...(isCarousel ? ["", "Deslizá las placas para ver el panorama completo →"] : []),
    "",
    "En esta edición:",
    bullets,
    "",
    `Para descubrir: ${edition.recommendation.title} — ${edition.recommendation.creator}.`,
    "",
    `Leé la crónica completa y escuchá las radios del país en el enlace de nuestra bio (${SITE_URL.replace(/^https?:\/\//, "")}).`,
    "",
    `#JackpotCultural #Cultura #Musica #Cine #Libros #${countryTag}`,
  ].join("\n");
}

function buildThreadsText(edition: CountryEdition): string {
  const pageUrl = `${SITE_URL}/pais/${edition.slug}`;
  const intro = stripMarkdown(edition.intro);
  const rec = `Para descubrir: ${edition.recommendation.title} (${edition.recommendation.creator}).`;
  const header = `${edition.flag} ${edition.country} (${edition.edition_week})`;
  const full = `${header}\n\n${intro}\n\n${rec}\n\n${pageUrl}`;
  if (full.length <= 495) return full;

  const short = `${header}\n\n${intro}\n\n${pageUrl}`;
  if (short.length <= 495) return short;

  const maxIntro = 495 - header.length - pageUrl.length - 6;
  return `${header}\n\n${intro.slice(0, maxIntro - 1)}…\n\n${pageUrl}`;
}

function buildXText(edition: CountryEdition, includeLink: boolean): string {
  const pageUrl = `${SITE_URL}/pais/${edition.slug}`;
  const intro = stripMarkdown(edition.intro);
  const prefix = `${edition.flag} ${edition.country} (${edition.edition_week}): `;
  const suffix = includeLink ? `\n\n${pageUrl}` : "";
  const maxBody = includeLink ? 245 - prefix.length : 275 - prefix.length;
  const trimmed =
    intro.length > maxBody ? `${intro.slice(0, maxBody - 1)}…` : intro;
  return `${prefix}${trimmed}${suffix}`;
}

async function publishToFacebook(
  pageId: string,
  token: string,
  imageUrl: string | null,
  message: string,
  pageUrl: string
): Promise<string> {
  if (imageUrl) {
    const body = new URLSearchParams({
      url: imageUrl,
      message,
      access_token: token,
    });
    const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
      method: "POST",
      body,
    });
    const data = (await res.json()) as {
      id?: string;
      post_id?: string;
      error?: { message: string };
    };
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }
    return data.post_id || data.id || "ok";
  }

  const body = new URLSearchParams({
    message,
    link: pageUrl,
    access_token: token,
  });
  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
    method: "POST",
    body,
  });
  const data = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data.id || "ok";
}

async function waitForIgContainer(
  containerId: string,
  token: string
): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    const statusData = (await statusRes.json()) as { status_code?: string };
    if (statusData.status_code === "FINISHED") return;
    if (
      statusData.status_code === "ERROR" ||
      statusData.status_code === "EXPIRED"
    ) {
      throw new Error(`Contenedor IG en estado ${statusData.status_code}`);
    }
  }
}

async function publishIgMediaId(
  igUserId: string,
  token: string,
  creationId: string
): Promise<string> {
  const pubRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: token,
    }),
  });
  const pubData = (await pubRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!pubRes.ok || !pubData.id) {
    const checkRes = await fetch(
      `${GRAPH_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    const checkData = (await checkRes.json()) as { status_code?: string };
    if (checkData.status_code === "PUBLISHED") {
      return creationId;
    }
    throw new Error(pubData.error?.message || `HTTP ${pubRes.status}`);
  }
  return pubData.id;
}

async function publishToInstagramSingle(
  igUserId: string,
  token: string,
  imageUrl: string,
  caption: string
): Promise<string> {
  const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: token,
    }),
  });
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error?.message || `HTTP ${createRes.status}`);
  }

  await waitForIgContainer(createData.id, token);
  return publishIgMediaId(igUserId, token, createData.id);
}

async function publishToInstagramCarousel(
  igUserId: string,
  token: string,
  imageUrls: string[],
  caption: string
): Promise<string> {
  const childIds: string[] = [];

  for (const url of imageUrls) {
    const res = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        image_url: url,
        is_carousel_item: "true",
        access_token: token,
      }),
    });
    const data = (await res.json()) as {
      id?: string;
      error?: { message: string };
    };
    if (!res.ok || !data.id) {
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }
    childIds.push(data.id);
  }

  for (const id of childIds) {
    await waitForIgContainer(id, token);
  }

  const parentRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
      access_token: token,
    }),
  });
  const parentData = (await parentRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!parentRes.ok || !parentData.id) {
    throw new Error(parentData.error?.message || `HTTP ${parentRes.status}`);
  }

  await waitForIgContainer(parentData.id, token);
  return publishIgMediaId(igUserId, token, parentData.id);
}

async function publishToThreads(
  threadsUserId: string,
  token: string,
  imageUrl: string | null,
  text: string
): Promise<string> {
  const params = new URLSearchParams({
    media_type: imageUrl ? "IMAGE" : "TEXT",
    text,
    access_token: token,
  });
  if (imageUrl) {
    params.set("image_url", imageUrl);
  }

  const createRes = await fetch(`${THREADS_BASE}/${threadsUserId}/threads`, {
    method: "POST",
    body: params,
  });
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!createRes.ok || !createData.id) {
    throw new Error(createData.error?.message || `HTTP ${createRes.status}`);
  }

  const creationId = createData.id;

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(
      `${THREADS_BASE}/${creationId}?fields=status&access_token=${encodeURIComponent(token)}`
    );
    const statusData = (await statusRes.json()) as { status?: string };
    if (statusData.status === "FINISHED") break;
    if (statusData.status === "ERROR" || statusData.status === "EXPIRED") {
      throw new Error(`Contenedor Threads en estado ${statusData.status}`);
    }
  }

  const pubRes = await fetch(
    `${THREADS_BASE}/${threadsUserId}/threads_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: token,
      }),
    }
  );
  const pubData = (await pubRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!pubRes.ok || !pubData.id) {
    throw new Error(pubData.error?.message || `HTTP ${pubRes.status}`);
  }
  return pubData.id;
}

function signOAuth1(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const encode = (s: string) =>
    encodeURIComponent(s).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encode(k)}=${encode(oauthParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(paramString),
  ].join("&");

  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map(
        (k) =>
          `${encode(k)}="${encode(headerParams[k as keyof typeof headerParams])}"`
      )
      .join(", ")
  );
}

async function publishToX(text: string): Promise<string> {
  const apiKey = process.env.X_API_KEY!;
  const apiSecret = process.env.X_API_SECRET!;
  const accessToken = process.env.X_ACCESS_TOKEN!;
  const accessSecret = process.env.X_ACCESS_SECRET!;

  const url = "https://api.x.com/2/tweets";
  const authHeader = signOAuth1(
    "POST",
    url,
    apiKey,
    apiSecret,
    accessToken,
    accessSecret
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json()) as { data?: { id: string }; detail?: string };
  if (!res.ok || !data.data?.id) {
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return data.data.id;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const countryArg = args.find((a) => a.startsWith("--country="))?.split("=")[1];

  const editions = loadEditions();
  if (editions.length === 0) {
    console.log("No hay ediciones generadas para publicar.");
    return;
  }

  const latestWeek = pickLatestWeek(editions);
  const state = loadState(latestWeek);

  const target = countryArg
    ? editions.find((e) => e.slug === countryArg)
    : editions.find(
        (e) => e.edition_week === latestWeek && !state.published[e.slug]
      ) || editions.find((e) => !state.published[e.slug]);

  if (!target) {
    console.log(
      `Todos los países disponibles ya fueron publicados en ${latestWeek}.`
    );
    return;
  }

  console.log(
    `=== Publicando: ${target.flag} ${target.country} (${target.edition_week}) ===`
  );

  const carouselUrls = await resolveCarouselUrls(target);
  const imageUrl = carouselUrls?.[0] || (await resolvePublicJpegUrl(target));
  const isCarousel = Boolean(carouselUrls);

  const fbMessage = buildFacebookCaption(target);
  const igCaption = buildInstagramCaption(target, isCarousel);
  const threadsText = buildThreadsText(target);
  const xIncludeLink = process.env.X_INCLUDE_LINK !== "false";
  const xText = buildXText(target, xIncludeLink);

  console.log(
    isCarousel
      ? `Carrusel detectado (3 placas): ${carouselUrls?.join(", ")}`
      : `Imagen JPEG simple detectada: ${imageUrl || "(ninguna)"}`
  );

  if (dryRun) {
    console.log("\n--- [DRY RUN] Facebook ---\n" + fbMessage);
    console.log("\n--- [DRY RUN] Instagram ---\n" + igCaption);
    console.log("\n--- [DRY RUN] Threads ---\n" + threadsText);
    console.log("\n--- [DRY RUN] X ---\n" + xText);
    return;
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaPageId = process.env.META_PAGE_ID;
  const metaIgId = process.env.META_IG_USER_ID;
  const threadsToken = process.env.THREADS_ACCESS_TOKEN;
  const threadsUserId = process.env.THREADS_USER_ID;

  const record: SocialPostRecord = {
    publishedAt: new Date().toISOString(),
  };

  if (metaToken && metaPageId) {
    try {
      const fbId = await publishToFacebook(
        metaPageId,
        metaToken,
        imageUrl,
        fbMessage,
        `${SITE_URL}/pais/${target.slug}`
      );
      record.facebookPostId = fbId;
      console.log(`  ✓ Facebook publicado (ID: ${fbId})`);
    } catch (err) {
      console.error(
        `  ✗ Error Facebook: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    console.log("  - Facebook omitido (faltan META_ACCESS_TOKEN / META_PAGE_ID).");
  }

  if (metaToken && metaIgId) {
    if (carouselUrls) {
      try {
        const igId = await publishToInstagramCarousel(
          metaIgId,
          metaToken,
          carouselUrls,
          igCaption
        );
        record.instagramMediaId = igId;
        record.instagramMode = "carousel";
        console.log(`  ✓ Instagram carrusel publicado (ID: ${igId})`);
      } catch (err) {
        console.error(
          `  ✗ Error Instagram carrusel: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if (imageUrl) {
      try {
        const igId = await publishToInstagramSingle(
          metaIgId,
          metaToken,
          imageUrl,
          igCaption
        );
        record.instagramMediaId = igId;
        record.instagramMode = "single";
        console.log(`  ✓ Instagram publicado (ID: ${igId})`);
      } catch (err) {
        console.error(
          `  ✗ Error Instagram: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      console.error("  ✗ Error Instagram: se requiere imagen JPEG pública.");
    }
  } else {
    console.log(
      "  - Instagram omitido (faltan META_ACCESS_TOKEN / META_IG_USER_ID)."
    );
  }

  if (threadsToken && threadsUserId) {
    try {
      const thId = await publishToThreads(
        threadsUserId,
        threadsToken,
        imageUrl,
        threadsText
      );
      record.threadsPostId = thId;
      console.log(`  ✓ Threads publicado (ID: ${thId})`);
    } catch (err) {
      console.error(
        `  ✗ Error Threads: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    console.log(
      "  - Threads omitido (faltan THREADS_ACCESS_TOKEN / THREADS_USER_ID)."
    );
  }

  if (
    process.env.X_API_KEY &&
    process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN &&
    process.env.X_ACCESS_SECRET
  ) {
    try {
      const xId = await publishToX(xText);
      record.xTweetId = xId;
      console.log(`  ✓ X publicado (ID: ${xId})`);
    } catch (err) {
      console.error(
        `  ✗ Error X: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    console.log("  - X omitido (sin credenciales configuradas).");
  }

  if (
    record.facebookPostId ||
    record.instagramMediaId ||
    record.threadsPostId ||
    record.xTweetId
  ) {
    state.published[target.slug] = record;
    saveState(state);
    console.log(`  ✓ Estado guardado en content/social-state.json`);
  } else {
    console.error("  ✗ No se pudo publicar en ninguna red.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});