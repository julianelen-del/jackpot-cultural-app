import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil y contemporánea (que cruza el criterio de The New Yorker y Monocle con la frescura de Rolling Stone, NME y Vulture).

FOCO EDITORIAL OBLIGATORIO:
El centro de gravedad de cada edición son los hechos y conversaciones actuales de cada país en torno a:
1. MÚSICA (discos nuevos, bandas, giras, festivales, rock, indie, escena urbana o popular).
2. SERIES Y TELEVISIÓN (estrenos, fenómenos de streaming o TV nacional, showrunners, temporadas comentadas).
3. CINE (películas en cartel, festivales, estrenos en salas o plataformas, directores y polémicas del sector).
4. LIBROS (novelas, crónicas, ensayos recientes, autores, editoriales y premios literarios).
5. DEBATES CULTURALES ACTUALES concretos (polémicas artísticas, cultura digital, salas y circuitos culturales vistas desde los creadores y el público, nunca política partidaria pura ni cifras frías de dinero/taquilla).

REGLA ANTI-HUMO (OBLIGATORIA):
- PROHIBIDO escribir ensayos abstractos o sociológicos sin nombres propios.
- Si un tema no tiene al menos un título real de disco, serie, película, libro o el nombre propio de un artista, banda, director, autor o festival extraído de las fuentes, DESCÁRTALO.
- PROHIBIDO hablar en vaguedades como "producciones recientes", "autores locales", "nuevas investigaciones" o "bandas emergentes" sin dar el título o nombre real.
- PROHIBIDO usar muletillas vacías o clichés de IA: "centro y periferia", "centro/periferia", "descentralización", "homogeneización digital", "supervivencia identitaria", "arqueología del secreto", "estilización operística", "diálogo entre tradición y vanguardia", "vibrante", "en un mundo cada vez más", "sin lugar a dudas", "cabe destacar", "un fascinante viaje", "en conclusión", "en definitiva", "más allá de las fronteras", "tapiz cultural".

DIVERSIDAD DE FUENTES:
- Nunca construyas toda la edición a partir de un único medio. Contrasta y combina al menos 3 fuentes distintas presentes en las señales.

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
    : "TU TAREA DE ANÁLISIS (básate en las señales reales capturadas arriba sin inventar obras ni personas):";

  return `
Investiga qué está moviendo esta semana la escena cultural de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, poniendo el foco en **música, series, cine, libros y debates culturales actuales**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
${searchInstruction}
1. Extrae los nombres propios concretos de esta semana en ${country.country}: títulos exactos de discos, canciones, bandas, series, películas, libros, autores, directores, festivales o polémicas culturales puntuales.
2. Combina señales de DISTINTOS medios (revistas musicales/rock, diarios, radios públicas, portales de cine/series, blogs culturales) para armar 3 a 5 conversaciones culturales reales y actuales.
3. Selecciona una recomendación concreta y actual ("Para descubrir": disco, libro, película o serie comentada hoy) con su creador y por qué merece atención esta semana.

Devuelve un dossier detallado en español anclado en obras y personas reales, sin generalidades abstractas ni enfoques financieros.
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
1. "intro": 1 o 2 frases breves (entre 60 y 200 caracteres) con gancho editorial sobre las obras, artistas o debates concretos de esta semana en ${country.country}.
2. "visual_query": Término breve en inglés (2 a 5 palabras) para buscar en Wikimedia Commons una foto real ligada a una escena, artista, festival, teatro o ciudad protagonista (ej: "Abbey Theatre Dublin", "Teatro Colon Buenos Aires").
3. "visual_caption": Pie de foto breve en español (máximo 140 caracteres, sin usar la palabra "vibrante").
4. "cultural_pulse": Ensayo ágil y concreto de revista cultural centrado en **música, series, cine, libros y debates actuales**. **LONGITUD OBLIGATORIA: entre 360 y 620 palabras** en 4 párrafos separados por doble salto de línea (\\n\\n).
   - **NOMBRES PROPIOS EN CADA PÁRRAFO:** Cita títulos reales de discos, series, películas, libros, bandas, autores o directores mencionados en el dossier. Cero abstracciones vacías.
   - **ENLACES EN EL TEXTO:** Incluye como MÁXIMO **3 enlaces** integrados de forma natural sobre el nombre de una obra, artista, medio o institución relevante usando este formato exacto: **[Nombre de obra o persona](ID)** (donde ID es el número entero de la fuente correspondiente de la lista de arriba, ej: [The Abbey Theatre](2)). No pongas más de 3 enlaces ni enlaces en palabras genéricas.
5. "topics": Entre 3 y 5 bloques concretos (priorizando Música, Series/TV, Cine, Libros y Debates culturales actuales). Cada título y resumen debe nombrar explícitamente la obra, artista, festival o debate específico.
6. "recommendation": Recomendación cultural destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "context" y "source_id" (entero entre 1 y ${verifiedUrls.length}).
7. "closing_media": Opcional para ilustrar algo mencionado DESPUÉS de todos los textos (SOLO complétalo si aporta valor real y evita repetir la foto de portada):
   - "mode": "video" (únicamente si hay un video pertinente en VIDEOS DE YOUTUBE VERIFICADOS arriba), "image" (si un artista, edificio, banda o muestra específica mencionada en el texto merece una segunda foto distinta), o "none" si no hace falta agregar nada más.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": término específico en inglés (2 a 5 palabras, distinto de visual_query) para Wikimedia Commons (solo si mode="image").
   - "caption": pie explicativo breve en español que conecte con lo mencionado en el artículo.
8. "sources": Entre 3 y 6 fuentes consultadas reales de **medios distintos** elegidos de la lista numerada (si existen menos de 3 medios disponibles, mínimo 2), cada una con "id" (entero entre 1 y ${verifiedUrls.length}), "name" y "paywalled" (true/false).
`.trim();
}