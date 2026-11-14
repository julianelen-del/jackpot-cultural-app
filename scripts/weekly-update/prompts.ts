import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional de prestigio (inspirada en The New Yorker, Monocle, Babelia y Revista Ñ).

REGLA FUNDAMENTAL:
JACKPOT CULTURAL NO resume artículos ni lista noticias sueltas.
JACKPOT CULTURAL sintetiza CONVERSACIONES CULTURALES: qué preocupa, entusiasma, inspira o debate el mundo cultural de un país esta semana.

TONO Y CALIDAD:
- Prosa elegante, humana, intelectualmente curiosa y accesible para lectores internacionales de habla hispana.
- Contextualiza referencias locales (autores, premios, salas, polémicas, movimientos) para alguien que no vive en ese país.
- Cero lenguaje genérico o clichés de IA (prohibido usar frases como "En un mundo cada vez más...", "Sin lugar a dudas", "Cabe destacar", "Un fascinante viaje", "En conclusión", "En definitiva", "Más allá de las fronteras", "testimonio vibrante", "tapiz cultural").
- Nunca inventes datos, obras, autores ni enlaces.

POLÍTICA DE PAYWALLS Y DERECHOS DE AUTOR:
- Nunca copies párrafos ni reproduzcas textos protegidos.
- Si un debate relevante surge en un medio con muro de pago (paywall), úsalo como brújula temática, busca fuentes abiertas complementarias para comprender el fenómeno, contextualízalo con tus propias palabras y enlaza las fuentes cuando corresponda.
`.trim();

export function buildResearchPrompt(
  country: CountrySourceConfig,
  rssContext: string,
  previousTopics: string[],
  weekLabel: string,
  useSearchTool: boolean
): string {
  const antiRepeat =
    previousTopics.length > 0
      ? `\nTEMAS CUBIERTOS LA SEMANA ANTERIOR (evita repetirlos salvo que haya un giro nuevo relevante):\n- ${previousTopics.join("\n- ")}\n`
      : "";

  const searchInstruction = useSearchTool
    ? "TU TAREA DE INVESTIGACIÓN (usa Google Search):"
    : "TU TAREA DE ANÁLISIS (básate en las señales reales capturadas arriba y tu contexto cultural):";

  return `
Investiga la conversación cultural actual de **${country.country}** (${country.continent}) para la edición de la semana **${weekLabel}**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE FEEDS PÚBLICOS (últimos 7 días):
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
${searchInstruction}
1. Identifica las 3 a 5 conversaciones, polémicas, estrenos, exposiciones, fenómenos literarios, cinematográficos, musicales, teatrales o de cultura digital que están marcando la semana cultural en ${country.country}.
2. Si algún medio importante tiene muro de pago, prioriza fuentes abiertas complementarias para contextualizar el fenómeno sin reproducir texto protegido.
3. Selecciona una recomendación cultural concreta y valiosa ("Para descubrir": un libro, película, exposición, autor, artista, álbum, obra o movimiento vinculado al momento cultural actual del país).

Devuelve un dossier de investigación detallado y extenso en español con:
- Panorama cultural central de la semana (ideas, tensiones, debates y contexto para lectores extranjeros).
- Los 3 a 5 temas destacados con su disciplina y análisis.
- La recomendación cultural específica y por qué vale la pena descubrirla ahora.
- Notas claras de qué fuentes son abiertas o tienen suscripción.
`.trim();
}

export function buildSynthesisPrompt(
  country: CountrySourceConfig,
  researchDossier: string,
  verifiedUrls: { title: string; url: string }[],
  weekLabel: string
): string {
  const numberedSources = verifiedUrls
    .map((u, idx) => `[${idx + 1}] ${u.title}`)
    .join("\n");

  return `
Con base EXCLUSIVAMENTE en el dossier de investigación siguiente, redacta la edición final en español de **${country.country}** para la semana **${weekLabel}**.

DOSSIER DE INVESTIGACIÓN:
${researchDossier}

FUENTES NUMERADAS DISPONIBLES (usa su número entero ID entre 1 y ${verifiedUrls.length}):
${numberedSources}

REGLAS ESTRICTAS DE REDACCIÓN Y FORMATO:
1. "intro": 1 o 2 frases breves (entre 60 y 200 caracteres) que presenten el clima cultural de la semana en ${country.country}.
2. "visual_query": Término breve en inglés (2 a 5 palabras) para buscar en Wikimedia Commons una fotografía real de un museo, teatro, festival o lugar cultural protagonista en ${country.country} (ej: "Teatro Colon Buenos Aires", "Centre Pompidou Paris").
3. "visual_caption": Pie de foto editorial breve en español (máximo 140 caracteres).
4. "cultural_pulse": Ensayo breve de revista cultural. **LONGITUD OBLIGATORIA: entre 420 y 650 palabras** (es un error grave escribir menos de 350 palabras o más de 750). Escribe exactamente 4 párrafos extensos y profundos de unas 110–150 palabras cada uno, separados por doble salto de línea (\\n\\n). Conecta ideas, debates y fenómenos; NO listes noticias.
5. "topics": Entre 3 y 5 bloques (ej. Literatura, Cine, Música, Teatro, Artes visuales, Cultura digital, Arquitectura, Ensayo). Cada uno con "category", "title" y "summary" sustancioso.
6. "recommendation": Una recomendación cultural destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "context" y "source_id" (número entero válido entre 1 y ${verifiedUrls.length} de la lista de arriba).
7. "sources": Entre 2 y 6 fuentes consultadas reales elegidas de la lista numerada de arriba, cada una con "id" (número entero entre 1 y ${verifiedUrls.length}), "name" (nombre limpio del medio o blog) y "paywalled" (true/false).
`.trim();
}