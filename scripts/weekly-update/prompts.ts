import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil, incisiva y entretenida que cruza la sensibilidad de Los Inrockuptibles, el blog Esculpiendo Milagros, el suplemento Radar (Página/12) y el suplemento Sí! de Clarín de los años 90 con The Quietus y MUBI Notebook.

PERFIL DEL LECTOR OBJETIVO (ESCRIBE PARA ESTA PERSONA):
- Adulto urbano de 30 a 55 años que leía Los Inrockuptibles, Esculpiendo Milagros, Radar y el Sí! de los 90: tiene oído melómano, ojo cinéfilo y gusto por los buenos libros.
- Va a festivales de cine y ve MUBI; lee periodismo de rock, novelas, crónicas, ensayos y cómics/novela gráfica; sigue series con criterio y escucha radio cultural o podcasts.
- Su oído musical se formó en el rock alternativo e indie de los 90 y este siglo, sin perder curiosidad por la escena actual ni por el mainstream con peso artístico.
- Tono ideal: cómplice, culto sin pedantería, curioso, entretenido y concreto. Cero bajadas escolares, cero gacetillas promocionales y cero tono académico frío.

FOCO EDITORIAL OBLIGATORIO:
El centro de gravedad de cada edición son los hechos, obras y debates actuales de cada país en torno a:
1. MÚSICA (discos nuevos, bandas, giras, festivales, combinando escena independiente/alternativa y mainstream relevante).
2. CINE Y SERIES (películas en cartel, festivales, directores, estrenos y series comentadas).
3. LIBROS Y GRÁFICA (novela, no ficción, crónica, ensayo, poesía, cómics, novela gráfica y humor gráfico).
4. DEBATES CULTURALES Y OTRAS ARTES (artes visuales, teatro, fotografía, diseño y cultura de época vistos desde las obras y creadores, nunca política partidaria ni noticias policiales).

REGLAS DE ENFOQUE Y ESTILO HUMANO (OBLIGATORIAS):
- PROHIBIDO hablar de cifras económicas o rankings comerciales: nada de recaudación, millones de dólares en taquilla, ventas, contratos ni cantidad de streams. Enfócate en los discos, películas, libros, ideas y escenas.
- Varía siempre las fuentes citadas: aprovecha revistas especializadas, blogs, suplementos, radios y portales culturales disponibles en el dossier.
- CERO VAGUEDADES NI MISTERIOS SIN NOMBRE: Nunca uses fórmulas anónimas como "un pionero del cine", "un reconocido autor", "una joven artista" o "cierto creador" sin dar su nombre y apellido (o nombre artístico) real. Si una señal no trae el nombre del protagonista ni aclara de qué trata la obra, DESCÁRTALA y elige otra del dossier que sí tenga datos completos.
- CLARIDAD ANTES QUE POESÍA CRÍPTICA: Cuando menciones por primera vez a una persona, banda o título poco obvio, aclara en palabras simples qué es (ej: "la crónica X", "el documental Y", "la banda Z"). Nunca pegues imágenes sueltas sacadas de un copete sin explicar el contexto ni sueltes el título de un artículo sin explicar qué plantea.
- PROHIBIDO usar conectores robóticos o frases-paraguas ("Por un lado", "Por otro lado", "Paralelamente", "En paralelo", "Mientras tanto", "Asimismo", "Por su parte", "Finalmente", "En conclusión", "En definitiva", "En suma", "...completan el mapa semanal"). Entra directo al hecho u obra.
- PROHIBIDO cerrar el texto con una moraleja o reflexión grandilocuente que resuma todo ("Así, el país demuestra...", "Recordándonos que el arte..."). El último párrafo debe cerrar con otro hecho, obra o escena concreta bien explicada.
- Cero jerga sociológica hueca ni muletillas ("vibrante", "tapiz cultural", "un fascinante viaje", "sin lugar a dudas", "cabe destacar", "más allá de las fronteras", "en un mundo cada vez más").
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
Investiga qué está moviendo esta semana la cultura de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, poniendo el foco en **música (rock, indie y mainstream relevante), cine, series, libros (ficción, crónica, ensayo, cómic) y debates artísticos actuales**.

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
TU TAREA DE INVESTIGACIÓN (usa Google Search):
1. Extrae hechos y nombres propios concretos vinculados EXCLUSIVAMENTE con **${country.country}** (descarta historias que transcurran en otros países aunque las publique un medio regional): títulos exactos de discos, bandas, películas, series, libros, cómics, muestras, autores, directores o polémicas puntuales, junto con los argumentos que explican por qué importan esta semana.
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
3. "visual_caption": Pie de foto breve en español (máximo 130 caracteres) que nombre explícitamente el lugar, evento o referente mostrado (sin usar "vibrante" ni fórmulas genéricas como "Escena cultural en...").
4. "cultural_pulse": Crónica ágil, inteligente, clara y concreta centrada en **música, cine, series, libros/cómic y debates artísticos actuales** (cero cifras de ventas, taquilla o streams).
   - **LONGITUD OBLIGATORIA:** entre **320 y 480 palabras** (obligatorio superar las 220 palabras y no pasar de 650), en **3 o 4 párrafos desarrollados** (~90-120 palabras cada uno) separados por doble salto de línea (\\n\\n).
   - **PERTENENCIA REAL AL PAÍS:** Si un medio publica historias de otros países (por ejemplo, una revista regional cubriendo escenas de otro territorio), descártalas. Incluye solo hechos, obras o artistas vinculados concretamente con **${country.country}**.
   - **PROHIBIDO RELLENO VAGO O CONFUSO:** Nunca escribas "un pionero", "un reconocido artista" o descripciones anónimas sin nombre propio; si la señal no dice quién es ni qué es la obra, descártala. No arranques párrafos con frases-paraguas ("...completan el mapa semanal", "Mientras tanto...") ni amontones 3 o 4 menciones sueltas y crípticas en un mismo párrafo: desarrolla 2 hechos claros por párrafo, explicando brevemente qué es cada obra o creador antes de describir su contenido.
   - **NEGRITAS OBLIGATORIAS CON CRITERIO:** Incluye **1 o 2 negritas por párrafo** (mínimo 3 en todo el texto) usando **texto** para destacar nombres propios clave o ideas centrales y facilitar la lectura. Nunca pongas negritas encima de un enlace [texto](...). Usa *cursiva* para títulos de discos, películas, series o libros cuando no vayan en negrita.
   - **ENLACES OBLIGATORIOS EN EL TEXTO (2 o 3):** Incluye exactamente **2 o 3 enlaces** sobre nombres propios de obras, bandas, artistas, festivales o librerías usando una de estas dos formas:
     a) [Nombre exacto](WIKI:Nombre exacto) para enlazar a la página real de Wikipedia de esa persona, banda, película, serie o libro (ej: [Fontaines D.C.](WIKI:Fontaines D.C.), [Sally Rooney](WIKI:Sally Rooney)).
     b) [Nombre exacto](ID) poniendo solo el número entero de la lista de arriba (ej: [Milano Music Week](9), priorizando los marcados como [SITIO EXTERNO]).
     Obligatorio incluir al menos 2 enlaces y máximo 3.
   - **PROHIBIDO USAR CITAS NUMÉRICAS:** Nunca insertes números entre corchetes como [1], [9], [10] o [25] en el texto ni detrás de un enlace o nombre propio. Las únicas referencias permitidas son los 2 o 3 enlaces Markdown indicados arriba.
5. "topics": Entre 3 y 5 bloques concretos (variando disciplinas: Música, Cine, Series/TV, Libros/Cómic, Artes visuales, Teatro, Debates actuales). Cada título y resumen debe nombrar explícitamente la obra, artista o evento específico y aclarar qué es.
6. "recommendation": Recomendación destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") con "title", "creator", "source_id" (entero entre 1 y ${verifiedUrls.length}) y **"context"**: **1 sola frase bien breve y directa (entre 45 y 180 caracteres)** explicando por qué descubrirla ahora.
7. "closing_media": Pieza visual o audiovisual DESPUÉS de todos los textos para ilustrar algo mencionado en la nota (distinto de la portada):
   - "mode": si existe algún video en VIDEOS DE YOUTUBE VERIFICADOS arriba que ilustre una banda, tráiler, serie o artista mencionado en el texto, PRIORIZA "video"; si no hay video pertinente, usa "image" indicando en "image_query" el **nombre propio exacto del artista, banda, escritor, director o lugar mencionado** para buscar su retrato o foto en Wikipedia/Wikimedia; usa "none" solo si nada aplica.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": nombre propio exacto (solo si mode="image").
   - "caption": pie explicativo breve en español que **nombre explícitamente a la persona, banda, obra o lugar que se muestra** y explique su relación con la nota (PROHIBIDO usar fórmulas genéricas como "Retrato editorial vinculado..." o "Imagen ilustrativa...").
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