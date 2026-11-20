import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import type { EpisodeMeta } from "./generate-episode";

const EPISODES_JSON_PATH = path.join(process.cwd(), "public", "podcast", "episodes.json");
const GRAPH_BASE = "https://graph.facebook.com/v27.0";
const THREADS_BASE = "https://graph.threads.net/v1.0";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://jackpot-cultural-app.vercel.app").replace(/\/+$/, "");

async function waitForPublicJpeg(url: string): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok && (res.headers.get("content-type") || "").includes("jpeg")) return true;
    } catch {
      // Reintentar
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  return false;
}

async function publishFacebookPhoto(pageId: string, token: string, imageUrl: string, message: string): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: "POST",
    body: new URLSearchParams({ url: imageUrl, message, access_token: token }),
  });
  const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.post_id || data.id || "ok";
}

async function publishInstagramPhoto(igUserId: string, token: string, imageUrl: string, caption: string): Promise<string> {
  const createRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
  });
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
  if (!createRes.ok || !createData.id) throw new Error(createData.error?.message || `HTTP ${createRes.status}`);

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${GRAPH_BASE}/${createData.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const stData = (await st.json()) as { status_code?: string };
    if (stData.status_code === "FINISHED") break;
    if (stData.status_code === "ERROR" || stData.status_code === "EXPIRED") throw new Error(`Estado IG ${stData.status_code}`);
  }

  const pubRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: createData.id, access_token: token }),
  });
  const pubData = (await pubRes.json()) as { id?: string; error?: { message: string } };
  if (!pubRes.ok || !pubData.id) throw new Error(pubData.error?.message || `HTTP ${pubRes.status}`);
  return pubData.id;
}

async function publishThreadsPhoto(threadsUserId: string, token: string, imageUrl: string, text: string): Promise<string> {
  const createRes = await fetch(`${THREADS_BASE}/${threadsUserId}/threads`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "IMAGE", image_url: imageUrl, text, access_token: token }),
  });
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } };
  if (!createRes.ok || !createData.id) throw new Error(createData.error?.message || `HTTP ${createRes.status}`);

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${THREADS_BASE}/${createData.id}?fields=status&access_token=${encodeURIComponent(token)}`);
    const stData = (await st.json()) as { status?: string };
    if (stData.status === "FINISHED") break;
    if (stData.status === "ERROR" || stData.status === "EXPIRED") throw new Error(`Estado Threads ${stData.status}`);
  }

  const pubRes = await fetch(`${THREADS_BASE}/${threadsUserId}/threads_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: createData.id, access_token: token }),
  });
  const pubData = (await pubRes.json()) as { id?: string; error?: { message: string } };
  if (!pubRes.ok || !pubData.id) throw new Error(pubData.error?.message || `HTTP ${pubRes.status}`);
  return pubData.id;
}

async function main() {
  const spotifyUrl = (process.env.SPOTIFY_SHOW_URL || "").trim();
  if (!spotifyUrl) {
    console.log("Promoción en redes omitida: todavía no está cargado el secreto SPOTIFY_SHOW_URL en GitHub.");
    return;
  }

  if (!fs.existsSync(EPISODES_JSON_PATH)) {
    console.log("No existe public/podcast/episodes.json.");
    return;
  }

  const episodes = JSON.parse(fs.readFileSync(EPISODES_JSON_PATH, "utf-8")) as EpisodeMeta[];
  const episode = episodes[0];
  if (!episode) return;

  const imageUrl = `${SITE_URL}/social-cards/${episode.cardFileName}`;
  console.log(`Esperando disponibilidad pública de ${imageUrl}...`);
  const ready = await waitForPublicJpeg(imageUrl);
  if (!ready) {
    console.error("La placa promocional todavía no respondió en Vercel.");
    return;
  }

  const bullets = episode.headlines.slice(0, 3).map((h) => `• ${h}`).join("\n");
  const fbText = [
    `🎙️ Nuevo episodio del pódcast de Jackpot Cultural: ${episode.subtitle} (${episode.week})`,
    "",
    episode.description,
    "",
    bullets,
    "",
    `Escuchalo y suscribite gratis en Spotify: ${spotifyUrl}`,
  ].join("\n");

  const igText = [
    `🎙️ NUEVO EPISODIO · ${episode.subtitle.toUpperCase()} (${episode.week})`,
    "",
    episode.description,
    "",
    bullets,
    "",
    "Escuchalo y suscribite gratis buscando Jackpot Cultural en Spotify (enlace en nuestra bio).",
    "",
    "#JackpotCultural #Podcast #Cultura #Musica #Cine #Libros #Spotify",
  ].join("\n");

  const thText = `🎙️ Nuevo episodio de Jackpot Cultural: ${episode.subtitle} (${episode.week}).\n\n${episode.description}\n\nEscuchalo y suscribite en Spotify:\n${spotifyUrl}`.slice(0, 495);

  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaPageId = process.env.META_PAGE_ID;
  const metaIgId = process.env.META_IG_USER_ID;
  const thToken = process.env.THREADS_ACCESS_TOKEN;
  const thId = process.env.THREADS_USER_ID;

  if (metaToken && metaPageId) {
    try { console.log(`  ✓ Facebook pódcast: ${await publishFacebookPhoto(metaPageId, metaToken, imageUrl, fbText)}`); }
    catch (e) { console.error(`  ✗ Error Facebook pódcast: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (metaToken && metaIgId) {
    try { console.log(`  ✓ Instagram pódcast: ${await publishInstagramPhoto(metaIgId, metaToken, imageUrl, igText)}`); }
    catch (e) { console.error(`  ✗ Error Instagram pódcast: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (thToken && thId) {
    try { console.log(`  ✓ Threads pódcast: ${await publishThreadsPhoto(thId, thToken, imageUrl, thText)}`); }
    catch (e) { console.error(`  ✗ Error Threads pódcast: ${e instanceof Error ? e.message : String(e)}`); }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});