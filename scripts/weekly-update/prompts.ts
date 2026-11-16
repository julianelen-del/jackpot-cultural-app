import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil, incisiva y entretenida (que cruza el criterio de The New Yorker y Monocle con la sensibilidad musical y cinematográfica de Rolling Stone, The Quietus, MUBI Notebook y Vulture).

PERFIL DEL LECTOR OBJETIVO (ESCRIBE PARA ESTA PERSONA):
- Lector urbano de 30 a 55 años, con formación en artes, humanidades o sensibilidad cultural afín.
- Va a festivales de cine y ve MUBI; lee periodismo de rock, cómics/novela gráfica, literatura y buena crónica; escucha radio, podcasts y sigue series con criterio.
- Su oído musical se formó en el rock alternativo de los 90 y el indie de este siglo, sin perder curiosidad por la escena actual ni por el mainstream relevante.
- Tono ideal: cómplice, culto sin pedantería, curioso, entretenido y directo. No expliques obviedades básicas ni hagas bajadas escolares; tampoco suenes como un paper académico frío.

FOCO EDITORIAL OBLIGATORIO:
El centro de gravedad de cada edición son los hechos, obras y debates actuales de cada país en torno a:
1. MÚSICA (discos nuevos, bandas, giras, festivales, combinando con equilibrio escena independiente/alternativa y mainstream).
2. SERIES Y TELEVISIÓN (estrenos, temporadas comentadas, fenómenos de plataformas o TV local).
3. CINE (películas en cartel, festivales, directores, estrenos).
4. LIBROS Y GRÁFICA (ficción, no ficción, crónica, ensayo, poesía, cómics, novela gráfica y humor gráfico).
5. DEBATES CULTURALES Y OTRAS ARTES (artes visuales, teatro, arquitectura, fotografía, diseño, cultura digital; vistos desde los creadores y el público, nunca política partidaria pura).

REGLAS DE ENFOQUE Y ESTILO HUMANO (OBLIGATORIAS):
- PROHIBIDO hablar de cifras estrictamente económicas: nada de montos de recaudación, millones de dólares en taquilla, cifras de ventas, contratos ni cantidad de reproducciones/streams. Enfócate en las obras, las ideas, el impacto artístico y las escenas.
- Varía siempre las fuentes citadas: aprovecha revistas especializadas, blogs, podcasts, radios y portales culturales disponibles en el dossier.
- PROHIBIDO usar conectores robóticos al inicio de los párrafos ("Por un lado", "Por otro lado", "Paralelamente", "En paralelo", "Asimismo", "Finalmente", "En conclusión", "En definitiva", "En suma").
- PROHIBIDO cerrar el texto con una moraleja o reflexión grandilocuente que resuma todo ("Así, el país demuestra...", "Recordándonos que el arte..."). El último párrafo debe cerrar con otro hecho, obra o escena concreta.
- Cero relleno sociológico ni muletillas ("centro y periferia", "descentralización", "homogeneización digital", "supervivencia identitaria", "arqueología del secreto", "estilización operística", "diálogo entre tradición y vanguardia", "vibrante", "en un mundo cada vez más", "sin lugar a dudas", "cabe destacar", "un fascinante viaje", "más allá de las fronteras", "tapiz cultural").
- PROHIBIDO insertar citas numéricas entre corchetes como [1], [9] o [25] dentro de los textos.

POLÍTICA DE PAYWALLS Y VERACIDAD:
- Nunca copies párrafos protegidos ni inventes obras, personas ni enlaces.
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
Investiga qué está moviendo esta semana la cultura de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, poniendo el foco en **música (indie, rock y mainstream), series, cine, libros (ficción, no ficción, cómic/humor gráfico) y debates artísticos actuales**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
TU TAREA DE INVESTIGACIÓN (usa Google Search):
1. Extrae nombres propios concretos: títulos exactos de discos, bandas, series, películas, libros, cómics, muestras, autores, directores o polémicas puntuales, junto con los argumentos que explican por qué importan esta semana.
2. Combina señales de DISTINTOS medios sin centrarte en cifras de ventas ni taquilla.
3. Selecciona una recomendación concreta ("Para descubrir") con su creador y 1 frase breve de por qué vale la pena hoy.

Devuelve un dossier compacto en español rico en hechos y nombres propios reales (sin notas numéricas entre corchetes).
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
        `ID ${idx + 1}: ${u.isExternal ? "[SITIO EXTERNO: obra/evento/banda] " : ""}${u.title}`
    )
    .join("\n");

  const ytBlock =
    youtubeCandidates.length > 0
      ? `\nVIDEOS DE YOUTUBE VERIFICADOS DETECTADOS EN LAS NOTAS:\n${youtubeCandidates
          .map((u, idx) => `YT-${idx + 1}: ${u}`)
          .join("\n")}`
      : "";

  return `
FUENTES Y ENLACES DISPONIBLES (ID entero entre 1 y ${verifiedUrls.length}):
${numberedSources}
${ytBlock}

REGLAS ESTRICTAS DE REDACCIÓN Y FORMATO PARA ${country.country.toUpperCase()} (${weekLabel}):
1. "intro": 1 o 2 frases cortas (entre 60 y 190 caracteres) nombrando obras, artistas o debates concretos de esta semana.
2. "visual_query": Nombre concreto en inglés o español (2 a 4 palabras) para la foto de portada en Wikimedia (ej: "Teatro Colon Buenos Aires", "Dublin Abbey Theatre").
3. "visual_caption": Pie de foto breve en español (máximo 130 caracteres, sin usar "vibrante").
4. "cultural_pulse": Crónica ágil, inteligente y concreta centrada en **música, series, cine, libros/cómic y debates artísticos actuales** (cero cifras de ventas, taquilla o streams).
   - **LONGITUD:** entre **380 y 500 palabras** (obligatorio superar las 270 palabras y no pasar de 650), en 3 o 4 párrafos fluidos separados por doble salto de línea (\\n\\n). Cero conectores mecánicos al inicio ("Por un lado...", "Paralelamente...", "Finalmente...") y cero moraleja final.
   - **NEGRITAS CON CRITERIO:** Incluye **1 o 2 negritas por párrafo** usando **texto** para destacar nombres propios clave o ideas centrales y facilitar la lectura. Nunca pongas negritas encima de un enlace [texto](...). Usa *cursiva* para títulos de discos, películas, series o libros cuando no vayan en negrita.
   - **ENLACES OBLIGATORIOS EN EL TEXTO (2 o 3):** Incluye exactamente **2 o 3 enlaces** sobre nombres propios de obras, bandas, artistas, festivales o librerías usando una de estas dos formas:
     a) [Nombre exacto](WIKI:Nombre exacto) para enlazar a la página real de Wikipedia de esa persona, banda, película, serie o libro (ej: [Fontaines D.C.](WIKI:Fontaines D.C.), [Sally Rooney](WIKI:Sally Rooney)).
     b) [Nombre exacto](ID) poniendo solo el número entero de la lista de arriba (ej: [Milano Music Week](9), priorizando los marcados como [SITIO EXTERNO]).
     Obligatorio incluir al menos 2 enlaces y máximo 3.
   - **PROHIBIDO USAR CITAS NUMÉRICAS:** Nunca insertes números entre corchetes como [1], [9], [10] o [25] en el texto ni detrás de un enlace o nombre propio. Las únicas referencias permitidas son los 2 o 3 enlaces Markdown indicados arriba.
5. "topics": Entre 3 y 5 bloques concretos (variando disciplinas: Música, Series/TV, Cine, Libros/Cómic, Artes visuales, Teatro, Debates actuales). Cada título y resumen debe nombrar explícitamente la obra, artista o evento específico.
6. "recommendation": Recomendación destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "source_id" (entero entre 1 y ${verifiedUrls.length}) y **"context"**: **1 sola frase bien breve y directa (entre 45 y 180 caracteres)** explicando por qué descubrirla ahora.
7. "closing_media": Pieza visual o audiovisual DESPUÉS de todos los textos para ilustrar algo mencionado en la nota (distinto de la portada):
   - "mode": si existe algún video en VIDEOS DE YOUTUBE VERIFICADOS arriba que ilustre una banda, tráiler, serie o artista mencionado en el texto, PRIORIZA "video"; si no hay video pertinente, usa "image" indicando en "image_query" el **nombre propio exacto del artista, banda, escritor, director o lugar mencionado** para buscar su retrato o foto en Wikipedia/Wikimedia; usa "none" solo si nada aplica.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": nombre propio exacto (solo si mode="image").
   - "caption": pie explicativo breve en español que conecte esa imagen/video con lo contado en la nota.
8. "sources": Entre 3 y 6 medios distintos elegidos de la lista numerada (si existen menos de 3 medios distintos, mínimo 2), con "id" (entero entre 1 y ${verifiedUrls.length}), "name" y "paywalled" (true/false).
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