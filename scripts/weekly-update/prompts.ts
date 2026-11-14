import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil, incisiva y entretenida (que cruza el criterio de The New Yorker y Monocle con la frescura de Rolling Stone, NME y Vulture).

FOCO EDITORIAL OBLIGATORIO:
El centro de gravedad de cada edición son los hechos, obras y conversaciones actuales de cada país en torno a:
1. MÚSICA (discos nuevos, bandas, giras, festivales, rock, indie, escena urbana o popular).
2. SERIES Y TELEVISIÓN (estrenos, temporadas comentadas, fenómenos de plataformas o TV local).
3. CINE (películas en cartel, festivales, directores, estrenos).
4. LIBROS (novelas, crónicas, ensayos recientes, autores y premios literarios).
5. DEBATES CULTURALES ACTUALES concretos (polémicas artísticas, cultura digital, salas y circuitos vistos desde los creadores y el público, nunca política partidaria pura ni cifras frías de dinero/taquilla).

REGLA ANTI-HUMO (OBLIGATORIA):
- Cero relleno filosófico o sociológico. Cada párrafo debe hablar de obras, artistas, bandas, películas, series o libros concretos con nombre propio sacados de las fuentes.
- Si un tema no tiene títulos reales o nombres propios concretos en el dossier, DESCÁRTALO.
- PROHIBIDO hablar en vaguedades como "producciones recientes", "autores locales", "nuevas investigaciones" o "bandas emergentes" sin dar el título o nombre real.
- PROHIBIDO usar muletillas vacías o clichés de IA: "centro y periferia", "centro/periferia", "descentralización", "homogeneización digital", "supervivencia identitaria", "arqueología del secreto", "estilización operística", "diálogo entre tradición y vanguardia", "vibrante", "en un mundo cada vez más", "sin lugar a dudas", "cabe destacar", "un fascinante viaje", "en conclusión", "en definitiva", "más allá de las fronteras", "tapiz cultural".

DIVERSIDAD DE FUENTES:
- Combina al menos 3 medios distintos presentes en las señales.

POLÍTICA DE PAYWALLS Y DERECHOS DE AUTOR:
- Nunca copies párrafos ni reproduzcas textos protegidos.
- Nunca inventes datos, obras, personas ni enlaces.
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
    : "TU TAREA DE ANÁLISIS (básate exclusivamente en las señales reales capturadas arriba sin inventar obras ni personas):";

  return `
Investiga qué está moviendo esta semana la cultura de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, poniendo el foco en **música, series, cine, libros y debates culturales actuales**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
${searchInstruction}
1. Extrae los nombres propios concretos de esta semana en ${country.country}: títulos exactos de discos, canciones, bandas, series, películas, libros, autores, directores, festivales o polémicas puntuales, junto con los argumentos o datos reales que explican por qué importan.
2. Combina señales de DISTINTOS medios (revistas musicales/rock, diarios, radios públicas, podcasts, portales de cine/series) para armar 3 a 5 conversaciones culturales vivas y específicas.
3. Selecciona una recomendación concreta y actual ("Para descubrir": disco, libro, película o serie comentada hoy) con su creador y por qué merece atención esta semana.

Devuelve un dossier compacto y rico en hechos, nombres propios y opiniones críticas reales, sin generalidades abstractas ni enfoques financieros.
`.trim();
}

export function buildSynthesisPrompt(
  country: CountrySourceConfig,
  researchDossier: string,
  verifiedUrls: { title: string; url: string }[],
  youtubeCandidates: string[],
  weekLabel: string
): string {
  const numberedSources = verifiedUrls
    .map((u, idx) => `[${idx + 1}] ${u.title}`)
    .join("\n");

  const ytBlock =
    youtubeCandidates.length > 0
      ? `\nVIDEOS DE YOUTUBE VERIFICADOS DETECTADOS EN LAS NOTAS:\n${youtubeCandidates
          .map((u, idx) => `[YT-${idx + 1}] ${u}`)
          .join("\n")}`
      : "";

  return `
Con base EXCLUSIVAMENTE en el dossier de investigación siguiente, redacta la edición final en español de **${country.country}** para la semana **${weekLabel}**.

DOSSIER DE INVESTIGACIÓN:
${researchDossier}

FUENTES NUMERADAS DISPONIBLES (usa su número entero ID entre 1 y ${verifiedUrls.length}):
${numberedSources}
${ytBlock}

REGLAS ESTRICTAS DE REDACCIÓN Y FORMATO:
1. "intro": 1 o 2 frases cortas (entre 60 y 190 caracteres) nombrando obras, artistas o debates concretos de esta semana en ${country.country}.
2. "visual_query": Nombre concreto en inglés o español (2 a 4 palabras) para buscar en Wikipedia/Wikimedia la foto de portada (ej: "Teatro Colon Buenos Aires", "Dublin Abbey Theatre").
3. "visual_caption": Pie de foto breve en español (máximo 130 caracteres, sin usar la palabra "vibrante").
4. "cultural_pulse": Crónica ágil, concreta y entretenida de revista cultural centrada en **música, series, cine, libros y debates actuales**.
   - **LONGITUD EXACTA:** entre **320 y 430 palabras** (NO escribas más de 460 palabras ni menos de 310), dividida en 3 o 4 párrafos concisos separados por doble salto de línea (\\n\\n). Cero relleno abstracto: cada párrafo debe contar hechos, obras, nombres propios y crítica concreta.
   - **ENLACES OBLIGATORIOS EN EL TEXTO:** Debes incluir exactamente **2 o 3 enlaces** integrados sobre el nombre propio de una obra, disco, serie, película, libro o artista relevante usando este formato exacto: **[Nombre propio](ID)** (donde ID es el número entero de la fuente correspondiente de la lista de arriba, por ejemplo [Fontaines D.C.](3)). Es un error no incluir al menos 2 enlaces o incluir más de 3.
5. "topics": Entre 3 y 5 bloques concretos (priorizando Música, Series/TV, Cine, Libros y Debates culturales actuales). Cada título y resumen debe nombrar explícitamente la obra, artista, festival o debate específico.
6. "recommendation": Recomendación cultural destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "context" y "source_id" (entero entre 1 y ${verifiedUrls.length}).
7. "closing_media": Pieza visual o audiovisual DESPUÉS de todos los textos para ilustrar a una persona, banda, película, serie o lugar específico mencionado en la nota (distinto de la portada):
   - "mode": usa "video" si hay un video pertinente en VIDEOS DE YOUTUBE VERIFICADOS arriba; si no, usa "image" indicando en "image_query" el **nombre exacto del artista, banda, escritor, director o lugar cultural mencionado en el texto** (ej: "David Kitt", "Paul Mescal", "Fito Paez", "Sally Rooney") para buscar su retrato o foto en Wikipedia/Wikimedia; usa "none" solo si ningún tema se presta a ilustración.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": nombre propio exacto (solo si mode="image").
   - "caption": pie explicativo breve en español que conecte esa imagen/video con lo contado en el artículo.
8. "sources": Entre 3 y 6 fuentes consultadas reales de **medios distintos** elegidos de la lista numerada (si existen menos de 3 medios disponibles, mínimo 2), cada una con "id" (entero entre 1 y ${verifiedUrls.length}), "name" y "paywalled" (true/false).
`.trim();
}