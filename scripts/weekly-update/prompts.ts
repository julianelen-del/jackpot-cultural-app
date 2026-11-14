import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional de prestigio (inspirada en The New Yorker, Monocle, Babelia y Revista Ñ).

REGLA FUNDAMENTAL:
JACKPOT CULTURAL NO resume artículos ni lista noticias sueltas.
JACKPOT CULTURAL sintetiza CONVERSACIONES CULTURALES: qué preocupa, entusiasma, inspira o debate el mundo cultural de un país esta semana.

TONO Y CALIDAD:
- Prosa elegante, humana, intelectualmente curiosa y accesible para lectores internacionales de habla hispana.
- Contextualiza referencias locales (autores, premios, salas, polémicas, movimientos) para alguien que no vive en ese país.
- Cero lenguaje genérico o clichés de IA (prohibido usar frases como "En un mundo cada vez más...", "Sin lugar a dudas", "Cabe destacar", "Un fascinante viaje", "En conclusión", "En definitiva", "Más allá de las fronteras").
- Nunca inventes datos, obras, autores ni enlaces.

POLÍTICA DE PAYWALLS Y DERECHOS DE AUTOR:
- Nunca copies párrafos ni reproduzcas textos protegidos.
- Si un debate relevante surge en un medio con muro de pago (paywall), úsalo como brújula temática, busca fuentes abiertas complementarias para comprender el fenómeno, contextualízalo con tus propias palabras y enlaza las fuentes cuando corresponda.
`.trim();

export function buildResearchPrompt(
  country: CountrySourceConfig,
  rssContext: string,
  previousTopics: string[],
  weekLabel: string
): string {
  const antiRepeat =
    previousTopics.length > 0
      ? `\nTEMAS CUBIERTOS LA SEMANA ANTERIOR (evita repetirlos salvo que haya un giro nuevo relevante):\n- ${previousTopics.join("\n- ")}\n`
      : "";

  return `
Investiga la conversación cultural actual de **${country.country}** (${country.continent}) para la edición de la semana **${weekLabel}**.

MEDIOS CULTURALES DE REFERENCIA EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE FEEDS PÚBLICOS (últimos 7 días):
${rssContext || "(Sin RSS disponibles; apóyate completamente en búsqueda web actualizada en los medios de referencia)."}
${antiRepeat}
TU TAREA DE INVESTIGACIÓN (usa Google Search):
1. Identifica las 3 a 5 conversaciones, polémicas, estrenos, exposiciones, fenómenos literarios, cinematográficos, musicales, teatrales o de cultura digital que están marcando la semana cultural en ${country.country}.
2. Si algún medio importante tiene muro de pago, busca fuentes abiertas complementarias (medios públicos, revistas culturales abiertas, reseñas, comunicados de museos/editoriales) para entender los argumentos y el contexto.
3. Encuentra una recomendación cultural concreta y valiosa ("Para descubrir": un libro, película, exposición, autor, artista, álbum, obra o movimiento vinculado al momento cultural actual del país) con una URL pública verificada.

Devuelve un dossier de investigación detallado en español con:
- Panorama cultural central de la semana (ideas, tensiones y tendencias, no lista de noticias).
- Los 3 a 5 temas destacados con su disciplina y contexto.
- La recomendación cultural específica y por qué vale la pena descubrirla ahora.
- Notas claras de qué medios tienen paywall y cuáles son abiertos.
`.trim();
}

export function buildSynthesisPrompt(
  country: CountrySourceConfig,
  researchDossier: string,
  verifiedUrls: { title: string; url: string }[],
  weekLabel: string
): string {
  const urlList = verifiedUrls
    .map((u, idx) => `${idx + 1}. [${u.title}] -> ${u.url}`)
    .join("\n");

  return `
Con base EXCLUSIVAMENTE en el dossier de investigación siguiente, redacta la edición final en español de **${country.country}** para la semana **${weekLabel}**.

DOSSIER DE INVESTIGACIÓN:
${researchDossier}

LISTA CERRADA DE ENLACES VERIFICADOS DISPONIBLES:
${urlList}

REGLAS ESTRICTAS DE REDACCIÓN Y FORMATO:
1. "intro": 1 o 2 frases breves (entre 60 y 200 caracteres) que presenten el clima cultural de la semana en ${country.country}.
2. "cultural_pulse": Bloque principal tipo ensayo breve de revista cultural. DEBE tener entre **350 y 720 palabras** (obligatorio respetar el rango 300-800), dividido en 3 a 5 párrafos separados por doble salto de línea (\\n\\n). Conecta ideas, debates y fenómenos; NO enumeres noticias.
3. "topics": Entre 3 y 5 bloques (ej. Literatura, Cine, Música, Teatro, Artes visuales, Cultura digital, Arquitectura, Televisión, Ensayo). Cada uno con "category", "title" y "summary" conciso y sustancioso.
4. "recommendation": Una recomendación cultural destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "context" y "url".
5. "sources": Entre 2 y 6 fuentes consultadas reales con "name", "url" y "paywalled" (true si el medio suele requerir suscripción/muro de pago, false si es abierto).
6. **PROHIBICIÓN ABSOLUTA DE INVENTAR URLs:** Tanto "recommendation.url" como cada "sources[].url" DEBEN copiarse exactamente de la "LISTA CERRADA DE ENLACES VERIFICADOS DISPONIBLES" de arriba.
`.trim();
}