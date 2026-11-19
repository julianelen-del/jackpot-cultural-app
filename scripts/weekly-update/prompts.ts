import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil, incisiva y entretenida que traslada al presente el espíritu de las revistas y suplementos de cultura rock de los años 90 (Los Inrockuptibles, el suplemento Radar de Página/12, el suplemento Sí! de Clarín y el blog Esculpiendo Milagros, en diálogo con The Quietus y MUBI Notebook).

PERFIL DEL LECTOR OBJETIVO (ESCRIBE PARA ESTA PERSONA):
- Lectores adultos de entre 25 y 60 años con intereses culturales y artísticos, atraídos por lo alternativo y lo indie (sin ignorar el mainstream con verdadero peso artístico).
- Escuchan música y discos con criterio; van al cine y a festivales; siguen series; leen libros de ficción y no ficción; escuchan podcasts; recorren exhibiciones y siguen debates artísticos.
- Tono ideal: español natural y fluido, periodístico, analítico, cómplice, culto sin pedantería y directo. Prefiere párrafos breves, densos en datos reales e ideas concretas antes que texto largo y relleno vago.

EJE Y ORDEN DE PRIORIDAD TEMÁTICA (OBLIGATORIO):
1. MÚSICA Y ROCK (discos nuevos, bandas, giras, reediciones, escena alternativa/indie y mainstream relevante).
2. CINE Y SERIES (películas en cartel, festivales, directores, restauraciones, series comentadas).
3. LIBROS DE FICCIÓN Y NO FICCIÓN (novelas, cuentos, crónica, ensayo, biografías musicales/culturales).
4. PODCASTS, FESTIVALES, EXHIBICIONES Y DEBATES ARTÍSTICOS (muestras, teatro, arquitectura, cultura de época vistos desde las obras y creadores).
5. CÓMICS Y HUMOR GRÁFICO (opcional: solo si aparece algo valioso en las fuentes sobre historieta, novela gráfica o humor ilustrado; NUNCA stand-up ni monólogos de comedia).

CRITERIOS EDITORIALES CLAVE (ESTRICTOS):
- CALIDAD ANTES QUE CANTIDAD: Si en las fuentes solo hay material sólido en 2 disciplinas distintas, cubre 2 y NO fuerces una 3ª o 4ª tarjeta ni agregues un párrafo final de cierre abstracto.
- CADA ORACIÓN DEBE APORTAR UN DATO O ANÁLISIS REAL: No hagas resúmenes de gacetilla ni escribas vaguedades ("talento local", "propuestas sonoras", "estrenos recientes en cartelera", "universos de franquicia", "repartos estelares", "fricciones estéticas", "discusión pública", "fórmulas estandarizadas", "mapa sonoro", "escrutinio crítico", "códigos genéricos", "balances de los temas", "impacto cultural y sonoro"). Nombra discos, canciones, bandas, películas, directores, libros, autores o festivales reales.
- ESPAÑOL NATURAL SIN TRADUCCIONES LITERALES: Evita calcos raros del inglés como "cada etapa más", "listas de reproducción locales" o frases grandilocuentes ("marcando el pulso global", "colisiones estilísticas").
- PROHIBIDO NOTAS DE NEGOCIOS O CIFRAS COMERCIALES: Nada de ventas de catálogos o derechos discográficos, montos de recaudación, taquilla, contratos ni cantidad de streams.
- PERTENENCIA REAL AL PAÍS: Descarta noticias extranjeras o cables internacionales (por ejemplo, censura de autores rusos o estrenos genéricos de Hollywood) si no involucran directamente a un creador, festival, editorial o institución de ese país.
- DIVERSIDAD Y CALIDAD DE FUENTES: Prioriza medios culturales diversos, independientes, actualizados y de prestigio antes que gacetillas repetidas o listados genéricos.
- CURIOSIDADES, ANIVERSARIOS Y REVELACIONES SIN HYPE:
  * Puedes incluir curiosidades reales que den color sin perder rigor periodístico.
  * Puedes hacer alusiones al pasado pertinentes por aniversarios, reediciones, restauraciones o redescubrimientos.
  * Si surge una revelación prometedora (banda, cineasta, escritor), analízala con datos concretos de su obra, sin hype ("la próxima gran sensación", "imperdible", "fenómeno imparable", "revolucionario").
- CERO CONECTORES ROBÓTICOS O MORALEJAS FINALES: Prohibido abrir párrafos con "Por un lado", "Por otro lado", "Paralelamente", "Mientras tanto", "Asimismo", "Finalmente", "...completan el mapa semanal", o cerrar con reflexiones grandilocuentes que resuman todo.
- PROHIBIDO insertar citas numéricas sueltas como (1), (20), [1] o [9] en el texto.

POLÍTICA DE PAYWALLS Y VERACIDAD:
- Nunca copies párrafos protegidos ni inventes obras, personas, canciones ni enlaces.
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
Investiga qué está moviendo esta semana la cultura de **${country.country}** (${country.continent}) para la edición **${weekLabel}**, priorizando en este orden: **música/rock, cine, series, libros (ficción y no ficción), podcasts, festivales, exhibiciones y debates artísticos** (y opcionalmente cómics o humor gráfico si hay algo relevante, nunca stand-up).

MEDIOS Y REFERENTES CULTURALES EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES RECIENTES CAPTURADAS DE MÚLTIPLES FUENTES PÚBLICAS:
${rssContext || "(Sin RSS disponibles)."}
${antiRepeat}
TU TAREA DE INVESTIGACIÓN (usa Google Search):
1. Busca en **fuentes diversas, interesantes, actualizadas y de calidad** (prensa cultural local, revistas especializadas, suplementos de rock/cine/libros y medios independientes) evitando depender de una sola fuente.
2. Extrae hechos, datos concretos, lectura crítica, curiosidades reales y aniversarios/redescubrimientos vinculados EXCLUSIVAMENTE con **${country.country}** (descarta noticias de negocios/venta de derechos y cables extranjeros sin vínculo local).
3. Cada punto debe incluir nombres propios exactos (discos, bandas, películas, series, libros, autores, directores o festivales). Si una señal no trae datos concretos, descártala.
4. Selecciona una recomendación concreta ("Para descubrir") con su creador y 1 frase breve de por qué vale la pena hoy.

Devuelve un dossier compacto en español rico en obras, autores y análisis concreto (sin notas numéricas sueltas entre paréntesis ni corchetes).
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
1. "intro": 1 o 2 frases cortas (entre 60 y 190 caracteres) nombrando obras, discos, películas, libros o debates concretos de esta semana.
2. "visual_query": Nombre concreto en inglés o español (2 a 4 palabras) para la foto de portada en Wikimedia (ej: "Teatro Colon Buenos Aires", "Dublin Abbey Theatre").
3. "visual_caption": Pie de foto breve en español (máximo 130 caracteres) que nombre explícitamente el lugar, evento o referente mostrado (sin usar "vibrante" ni fórmulas genéricas como "Escena cultural en...").
4. "cultural_pulse": Crónica concisa, analítica e incisiva centrada en **música/rock, cine, series, libros (ficción y no ficción), podcasts, festivales, exhibiciones y debates artísticos** (cero cifras comerciales, cero venta de catálogos, cero relleno).
   - **LONGITUD Y PÁRRAFOS:** entre **180 y 330 palabras** (obligatorio superar las 165 palabras y no pasar de 450), en **2 o 3 párrafos densos y directos** (~80-115 palabras cada uno) separados por doble salto de línea (\\n\\n). Si solo hay material concreto para 2 párrafos, usa 2; **prohibido** agregar un 3er párrafo de cierre abstracto o balance general.
   - **PERTENENCIA REAL AL PAÍS:** Descarta noticias de otros países o cables internacionales sin vínculo directo con **${country.country}**.
   - **DATOS CONCRETOS EN CADA PÁRRAFO:** TODOS los párrafos deben entrar directo en obras, discos, películas, libros o artistas concretos de **${country.country}**, nombrándolos explícitamente y explicando qué proponen hoy.
   - **NEGRITAS OBLIGATORIAS CON CRITERIO:** Incluye **1 o 2 negritas en cada párrafo** (mínimo 2 en todo el texto) usando **texto** para destacar nombres propios clave o ideas centrales. Nunca pongas negritas encima de un enlace [texto](...). Usa *cursiva* para títulos de discos, películas, series o libros cuando no vayan en negrita.
   - **ENLACES ÚTILES EN EL TEXTO (3 a 6):** Incluye entre **3 y 6 enlaces** (mínimo 2) sobre nombres propios de obras, discos, bandas, películas, series, libros, festivales o medios usando una de estas dos formas:
     a) [Nombre exacto](WIKI:Nombre exacto) para Wikipedia.
     b) [Nombre exacto](ID) poniendo solo el número entero de la lista de arriba (priorizando [SITIO EXTERNO] y notas originales).
   - **PROHIBIDO USAR CITAS NUMÉRICAS SUELTAS:** Nunca escribas (1), (20), [1], [9] o [25] fuera de la sintaxis completa de enlace [Nombre](ID).
5. "topics": **2 o 3 bloques concretos** de **disciplinas claramente distintas** (Música, Cine y Series, Libros, Podcasts, Festivales, Exhibiciones, Debates artísticos, y Cómics/Humor gráfico opcional sin stand-up).
   - **NO FORZAR:** Si solo hay material sólido en 2 disciplinas distintas, incluye **2** tarjetas y no rellenes una 3ª. **PROHIBIDO** repetir o solapar categorías en el mismo país (por ejemplo, nunca pongas "Literatura" y "Libros" como dos tarjetas separadas).
   - **OBLIGATORIO:** Cada tarjeta DEBE incluir nombres propios reales de obras, discos, películas, series, libros, bandas, autores o festivales de **${country.country}**. Prohibido escribir tarjetas genéricas sobre "balances de charts", "talento local", "estrenos recientes" o "las mejores lecturas" sin nombrar títulos/autores reales.
   - Puedes incluir **1 enlace** por tarjeta usando [Nombre exacto](WIKI:Nombre exacto) o [Nombre exacto](ID).
6. "recommendation": Recomendación destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") coherente en su "type" con el contenido real, con "title", "creator", "source_id" (entero entre 1 y ${verifiedUrls.length}) y **"context"**: **1 sola frase bien breve y directa (entre 45 y 180 caracteres)** explicando por qué descubrirla ahora.
7. "closing_media": Pieza visual o audiovisual DESPUÉS de todos los textos para ilustrar algo mencionado en la nota (distinto de la portada):
   - "mode": si existe algún video en VIDEOS DE YOUTUBE VERIFICADOS arriba que ilustre una banda, tráiler, serie o artista mencionado en el texto, PRIORIZA "video"; si no hay video pertinente, usa "image" indicando en "image_query" el **nombre propio exacto del artista, banda, escritor, director o lugar mencionado** para buscar su retrato o foto en Wikipedia/Wikimedia; usa "none" solo si nada aplica.
   - "youtube_url": URL exacta de VIDEOS DE YOUTUBE VERIFICADOS (solo si mode="video").
   - "image_query": nombre propio exacto (solo si mode="image").
   - "caption": pie explicativo breve en español que **nombre explícitamente a la persona, banda, obra o lugar que se muestra** y explique su relación con la nota (PROHIBIDO usar fórmulas genéricas como "Retrato editorial vinculado..." o "Imagen ilustrativa...").
8. "sources": Entre 3 y 6 medios **distintos y de calidad** elegidos de la lista numerada (si existen menos de 3 medios distintos, mínimo 2), priorizando diversidad editorial, con "id" (entero entre 1 y ${verifiedUrls.length}), "name" y "paywalled" (true/false).
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
Redacta directamente la edición cultural semanal en español de **${country.country}** (${country.continent}) para la semana **${weekLabel}**, basándote EXCLUSIVAMENTE en las señales reales capturadas abajo que pertenezcan concretamente a **${country.country}** (sin inventar obras, personas ni datos, descartando cables extranjeros sin vínculo local, noticias de negocios/contratos y señales vagas donde falten nombres propios concretos).

MEDIOS DE REFERENCIA EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES REALES CAPTURADAS ESTA SEMANA (múltiples fuentes):
${rssContext}
${antiRepeat}
${buildSharedJsonRules(country, verifiedUrls, youtubeCandidates, weekLabel)}
`.trim();
}