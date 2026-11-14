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

ESTILO HUMANO (OBLIGATORIO):
- Escribe como un periodista cultural humano, con ritmo fluido y transición natural de una idea a otra.
- PROHIBIDO usar conectores robóticos repetitivos al inicio de los párrafos ("Por un lado", "Por otro lado", "Paralelamente", "En paralelo", "Asimismo", "Finalmente", "En conclusión", "En definitiva", "En suma").
- PROHIBIDO cerrar el texto con una moraleja o reflexión grandilocuente que resuma todo ("Así, el país demuestra...", "Recordándonos que el arte...", "Una muestra de cómo la cultura..."). El último párrafo debe cerrar con otro hecho, obra o escena concreta.
- Cero relleno sociológico ni muletillas ("centro y periferia", "descentralización", "homogeneización digital", "supervivencia identitaria", "arqueología del secreto", "estilización operística", "diálogo entre tradición y vanguardia", "vibrante", "en un mundo cada vez más", "sin lugar a dudas", "cabe destacar", "un fascinante viaje", "más allá de las fronteras", "tapiz cultural").

DIVERSIDAD Y VERACIDAD:
- Combina al menos 3 medios distintos presentes en las señales.
- Nunca inventes obras, personas ni enlaces, ni copies párrafos protegidos.
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
Investiga qué está moviendo esta semana la cultura de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, poniendo el foco en **música, series, cine, libros y debates culturales actuales**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
TU TAREA DE INVESTIGACIÓN (usa Google Search):
1. Extrae nombres propios concretos: títulos exactos de discos, canciones, bandas, series, películas, libros, autores, directores, festivales o polémicas puntuales, junto con los datos reales que explican por qué importan esta semana.
2. Combina señales de DISTINTOS medios para armar 3 a 5 conversaciones culturales vivas.
3. Selecciona una recomendación concreta ("Para descubrir") con su creador y 1 frase breve de por qué vale la pena hoy.

Devuelve un dossier compacto en español rico en hechos y nombres propios reales.
`.trim();
}

function buildSharedJsonRules(
  country: CountrySourceConfig,
  verifiedUrls: { title: string; url: string; isExternal?: boolean }[],
  youtubeCandidates: string[],
  weekLabel: string
): string {
  const numberedSources = verifiedUrls
    .map(
      (u, idx) =>
        `[${idx + 1}] ${u.isExternal ? "[SITIO EXTERNO: obra/evento/banda] " : ""}${u.title}`
    )
    .join("\n");

  const ytBlock =
    youtubeCandidates.length > 0
      ? `\nVIDEOS DE YOUTUBE VERIFICADOS DETECTADOS EN LAS NOTAS:\n${youtubeCandidates
          .map((u, idx) => `[YT-${idx + 1}] ${u}`)
          .join("\n")}`
      : "";

  return `
FUENTES Y ENLACES NUMERADOS DISPONIBLES (ID entero entre 1 y ${verifiedUrls.length}):
${numberedSources}
${ytBlock}

REGLAS ESTRICTAS DE REDACCIÓN Y FORMATO PARA ${country.country.toUpperCase()} (${weekLabel}):
1. "intro": 1 o 2 frases cortas (entre 60 y 190 caracteres) nombrando obras, artistas o debates concretos de esta semana.
2. "visual_query": Nombre concreto en inglés o español (2 a 4 palabras) para la foto de portada en Wikimedia (ej: "Teatro Colon Buenos Aires", "Dublin Abbey Theatre").
3. "visual_caption": Pie de foto breve en español (máximo 130 caracteres, sin usar "vibrante").
4. "cultural_pulse": Crónica ágil, entretenida y concreta centrada en **música, series, cine, libros y debates actuales**.
   - **LONGITUD:** entre **380 y 500 palabras** (obligatorio superar las 320 palabras y no pasar de 650), en 3 o 4 párrafos fluidos separados por doble salto de línea (\\n\\n). Cero conectores mecánicos al inicio ("Por un lado...", "Paralelamente...", "Finalmente...") y cero moraleja final.
   - **ENLACES OBLIGATORIOS EN EL TEXTO (2 o 3):** Debes incluir exactamente **2 o 3 enlaces** sobre nombres propios de obras, bandas, artistas, festivales o librerías usando una de estas dos formas:
     a) **[Nombre exacto](WIKI:Nombre exacto)** para enlazar a la página real de Wikipedia de esa persona, banda, película, serie o libro (ej: [Fontaines D.C.](WIKI:Fontaines D.C.), [Sally Rooney](WIKI:Sally Rooney)).
     b) **[Nombre exacto](ID)** apuntando a un número entero de la lista de arriba (priorizando los marcados como [SITIO EXTERNO]).
     Obligatorio incluir al menos 2 enlaces y máximo 3.
5. "topics": Entre 3 y 5 bloques concretos (Música, Series/TV, Cine, Libros, Debates actuales). Cada título y resumen debe nombrar explícitamente la obra, artista o evento específico.
6. "recommendation": Recomendación destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "source_id" (entero entre 1 y ${verifiedUrls.length}) y **"context"**: **1 sola frase bien breve y directa (entre 45 y 180 caracteres)** explicando por qué descubrirla ahora.
7. "closing_media": Pieza visual o audiovisual DESPUÉS de todos los textos para ilustrar a una persona, banda, película, serie o lugar específico mencionado en la nota (distinto de la portada):
   - "mode": usa "video" si hay un video pertinente en VIDEOS DE YOUTUBE VERIFICADOS arriba; si no, usa "image" indicando en "image_query" el **nombre propio exacto del artista, banda, escritor, director o lugar mencionado** (ej: "Paul Mescal", "Fito Paez", "Guggenheim Bilbao") para buscar su retrato o foto en Wikipedia/Wikimedia; usa "none" solo si nada aplica.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": nombre propio exacto (solo si mode="image").
   - "caption": pie explicativo breve en español que conecte esa imagen/video con lo contado en la nota.
8. "sources": Entre 3 y 6 medios periodísticos consultados elegidos de la lista numerada (si existen menos de 3 medios distintos, mínimo 2), con "id" (entero entre 1 y ${verifiedUrls.length}), "name" y "paywalled" (true/false).
`.trim();
}

export function buildSynthesisPrompt(
  country: CountrySourceConfig,
  researchDossier: string,
  verifiedUrls: { title: string; url: string; isExternal?: boolean }[],
  youtubeCandidates: string[],
  weekLabel: string
): string {
  return `
Con base EXCLUSIVAMENTE en el dossier de investigación siguiente, redacta la edición final en español de **${country.country}** para la semana **${weekLabel}**.

DOSSIER DE INVESTIGACIÓN:
${researchDossier}

${buildSharedJsonRules(country, verifiedUrls, youtubeCandidates, weekLabel)}
`.trim();
}

export function buildDirectEditionPrompt(
  country: CountrySourceConfig,
  rssContext: string,
  previousTopics: string[],
  verifiedUrls: { title: string; url: string; isExternal?: boolean }[],
  youtubeCandidates: string[],
  weekLabel: string
): string {
  const antiRepeat =
    previousTopics.length > 0
      ? `\nTEMAS CUBIERTOS LA SEMANA ANTERIOR (evita repetirlos salvo que haya un giro nuevo):\n- ${previousTopics.join("\n- ")}\n`
      : "";

  return `
Redacta directamente la edición cultural semanal en español de **${country.country}** (${country.continent}) para la semana **${weekLabel}**, basándote EXCLUSIVAMENTE en las señales reales capturadas abajo (sin inventar obras, personas ni datos).

MEDIOS DE REFERENCIA EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES REALES CAPTURADAS ESTA SEMANA (múltiples fuentes):
${rssContext}
${antiRepeat}
${buildSharedJsonRules(country, verifiedUrls, youtubeCandidates, weekLabel)}
`.trim();
}