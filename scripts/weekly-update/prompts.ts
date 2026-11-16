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
- CERO VAGUEDADES NI MISTERIOS SIN NOMBRE: Nunca uses fórmulas anónimas como "un pionero del cine", "un reconocido autor", "una joven artista" o "cierto creador" sin dar su nombre y apellido (o nombre artístico) real. Si una señal no trae el nombre del protagonista ni aclara de qué trata la obra, DESCÁRTALA y elige otra del dossier que sí tenga datos completos.
- CLARIDAD ANTES QUE POESÍA CRÍPTICA: Cuando menciones por primera vez a una persona, colectivo o título poco obvio, aclara en palabras simples qué es (ej: "la crónica X", "el documental Y", "la artista Z"). Nunca pegues escenas poéticas sacadas de un copete sin explicar el contexto ni sueltes el título de un artículo sin explicar qué plantea.
- PROHIBIDO usar conectores robóticos o frases-paraguas ("Por un lado", "Por otro lado", "Paralelamente", "En paralelo", "Mientras tanto", "Asimismo", "Por su parte", "Finalmente", "En conclusión", "En definitiva", "En suma", "...completan el mapa semanal"). Entra directo al hecho u obra.
- PROHIBIDO cerrar el texto con una moraleja o reflexión grandilocuente que resuma todo ("Así, el país demuestra...", "Recordándonos que el arte..."). El último párrafo debe cerrar con otro hecho, obra o escena concreta bien explicada.
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
1. Extrae hechos y nombres propios concretos vinculados EXCLUSIVAMENTE con **${country.country}** (descarta historias que transcurran en otros países aunque las publique un medio regional): títulos exactos de discos, bandas, series, películas, libros, cómics, muestras, autores, directores o polémicas puntuales, junto con los argumentos que explican por qué importan esta semana.
2. Si una referencia menciona a un autor, director o pionero sin nombrarlo, averigua su nombre exacto antes de incluirlo; si no puedes confirmarlo con certeza, descarta ese dato.
3. Combina señales de DISTINTOS medios sin centrarte en cifras de ventas ni taquilla.
4. Selecciona una recomendación concreta ("Para descubrir") con su creador y 1 frase breve de por qué vale la pena hoy.

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
4. "cultural_pulse": Crónica ágil, inteligente, clara y concreta centrada en **música, series, cine, libros/cómic y debates artísticos actuales** (cero cifras de ventas, taquilla o streams).
   - **LONGITUD:** entre **380 y 500 palabras** (obligatorio superar las 270 palabras y no pasar de 650), en 3 o 4 párrafos fluidos separados por doble salto de línea (\\n\\n).
   - **PERTENENCIA REAL AL PAÍS:** Si un medio publica historias de otros países (por ejemplo, una revista regional cubriendo escenas de otro territorio), descártalas. Incluye solo hechos, obras o artistas vinculados concretamente con **${country.country}**.
   - **PROHIBIDO RELLENO VAGO O CONFUSO:** Nunca escribas "un pionero", "un reconocido artista" o descripciones anónimas sin nombre propio; si la señal no dice quién es ni qué es la obra, descártala. No arranques párrafos con frases-paraguas ("...completan el mapa semanal", "Mientras tanto...") ni amontones 3 o 4 menciones sueltas y crípticas en un mismo párrafo: es preferible desarrollar 2 hechos claros, explicando brevemente qué es cada obra o creador antes de describir su contenido.
   - **NEGRITAS CON CRITERIO:** Incluye **1 o 2 negritas por párrafo** usando **texto** para destacar nombres propios clave o ideas centrales y facilitar la lectura. Nunca pongas negritas encima de un enlace [texto](...). Usa *cursiva* para títulos de discos, películas, series o libros cuando no vayan en negrita.
   - **ENLACES OBLIGATORIOS EN EL TEXTO (2 o 3):** Incluye exactamente **2 o 3 enlaces** sobre nombres propios de obras, bandas, artistas, festivales o librerías usando una de estas dos formas:
     a) [Nombre exacto](WIKI:Nombre exacto) para enlazar a la página real de Wikipedia de esa persona, banda, película, serie o libro (ej: [Fontaines D.C.](WIKI:Fontaines D.C.), [Sally Rooney](WIKI:Sally Rooney)).
     b) [Nombre exacto](ID) poniendo solo el número entero de la lista de arriba (ej: [Milano Music Week](9), priorizando los marcados como [SITIO EXTERNO]).
     Obligatorio incluir al menos 2 enlaces y máximo 3.
   - **PROHIBIDO USAR CITAS NUMÉRICAS:** Nunca insertes números entre corchetes como [1], [9], [10] o [25] en el texto ni detrás de un enlace o nombre propio. Las únicas referencias permitidas son los 2 o 3 enlaces Markdown indicados arriba.
5. "topics": Entre 3 y 5 bloques concretos (variando disciplinas: Música, Series/TV, Cine, Libros/Cómic, Artes visuales, Teatro, Debates actuales). Cada título y resumen debe nombrar explícitamente la obra, artista o evento específico y aclarar qué es.
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
Redacta directamente la edición cultural semanal en español de **${country.country}** (${country.continent}) para la semana **${weekLabel}**, basándote EXCLUSIVAMENTE en las señales reales capturadas abajo que pertenezcan concretamente a **${country.country}** (sin inventar obras, personas ni datos, y descartando señales incompletas donde falten nombres propios o contexto claro).

MEDIOS DE REFERENCIA EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES REALES CAPTURADAS ESTA SEMANA (múltiples fuentes):
${rssContext}
${antiRepeat}
${buildSharedJsonRules(country, verifiedUrls, youtubeCandidates, weekLabel)}
`.trim();
}