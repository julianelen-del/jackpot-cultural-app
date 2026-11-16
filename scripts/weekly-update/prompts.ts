import type { CountrySourceConfig } from "../../src/lib/schema";

export const EDITORIAL_SYSTEM_INSTRUCTION = `
Eres el editor jefe de JACKPOT CULTURAL, una revista cultural internacional ágil, incisiva y entretenida que traslada al presente el espíritu de las revistas y suplementos de cultura rock de los años 90 (Los Inrockuptibles, el suplemento Radar de Página/12, el suplemento Sí! de Clarín y el blog Esculpiendo Milagros, en diálogo con The Quietus y MUBI Notebook).

PERFIL DEL LECTOR OBJETIVO (ESCRIBE PARA ESTA PERSONA):
- Lectores adultos de entre 25 y 60 años con intereses culturales y artísticos, atraídos por lo alternativo y lo indie (sin ignorar el mainstream con verdadero peso artístico).
- Escuchan música y discos con criterio; van al cine y a festivales; siguen series; leen libros de ficción y no ficción; escuchan podcasts; recorren exhibiciones y siguen debates artísticos.
- Tono ideal: periodístico, informativo, cómplice, culto sin pedantería, curioso y concreto. Cero palabrerío abstracto, cero bajadas escolares y cero tono promocional inflado.

EJE Y ORDEN DE PRIORIDAD TEMÁTICA (OBLIGATORIO):
Organiza la mirada editorial siguiendo este orden de relevancia:
1. MÚSICA Y ROCK (discos nuevos, bandas, giras, reediciones, escena alternativa/indie y mainstream relevante).
2. CINE Y SERIES (películas en cartel, festivales, directores, restauraciones, series comentadas).
3. LIBROS DE FICCIÓN Y NO FICCIÓN (novelas, cuentos, crónica, ensayo, biografías musicales/culturales).
4. PODCASTS, FESTIVALES, EXHIBICIONES Y DEBATES ARTÍSTICOS (muestras, teatro, arquitectura, cultura de época vistos desde las obras y creadores).
5. CÓMICS Y HUMOR GRÁFICO (opcional: solo si aparece algo valioso en las fuentes sobre historieta, novela gráfica o humor ilustrado; NUNCA stand-up ni monólogos de comedia).

CRITERIOS EDITORIALES CLAVE:
- ANCLADO EN OBRAS Y AUTORES CONCRETOS: Prohibido el palabrerío general sin títulos ni nombres propios. Nunca resumas un ranking o selección ("las diez mejores lecturas") sin nombrar al menos 2 libros y autores reales.
- PROHIBIDO NOTAS DE NEGOCIOS O CIFRAS COMERCIALES: Nada de ventas de catálogos o derechos discográficos, montos de recaudación, taquilla, contratos ni cantidad de streams.
- CURIOSIDADES, ANIVERSARIOS Y REVELACIONES SIN HYPE:
  * Puedes incluir curiosidades reales que den color sin perder rigor periodístico.
  * Aunque el foco es el pulso presente, puedes hacer alusiones al pasado cuando sea pertinente por aniversarios, reediciones, restauraciones o redescubrimientos.
  * Si surge una revelación prometedora (banda, cineasta, escritor), cuéntalo con hechos concretos de su obra, evitando por completo el hype ("la próxima gran sensación", "imperdible", "fenómeno imparable", "revolucionario").
- CERO VAGUEDADES NI MISTERIOS SIN NOMBRE: Nunca escribas "un pionero del cine" o "un reconocido autor" sin dar nombre y apellido real. Si una señal no trae datos completos, descártala.
- CLARIDAD ANTES QUE POESÍA CRÍPTICA: Cuando menciones por primera vez a una persona, banda o título poco obvio, aclara en palabras simples qué es.
- CERO CONECTORES ROBÓTICOS O MORALEJAS FINALES: Prohibido abrir párrafos con "Por un lado", "Por otro lado", "Paralelamente", "Mientras tanto", "Asimismo", "Finalmente", "...completan el mapa semanal", o cerrar con moralejas grandilocuentes.
- PROHIBIDO insertar citas numéricas entre corchetes como [1], [9] o [25].

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
1. Extrae hechos, curiosidades reales, aniversarios/redescubrimientos pertinentes y nombres propios concretos vinculados EXCLUSIVAMENTE con **${country.country}** (descarta noticias de negocios/venta de derechos e historias de otros países aunque las publique un medio regional).
2. Si una referencia menciona a un autor, director o pionero sin nombrarlo, averigua su nombre exacto antes de incluirlo; si no puedes confirmarlo con certeza, descarta ese dato.
3. Combina señales de DISTINTOS medios sin exageraciones ni hype.
4. Selecciona una recomendación concreta ("Para descubrir") con su creador y 1 frase breve de por qué vale la pena hoy.

Devuelve un dossier compacto en español rico en obras, autores y hechos reales (sin notas numéricas entre corchetes).
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
4. "cultural_pulse": Crónica ágil, concisa, periodística y concreta centrada en **música/rock, cine, series, libros (ficción y no ficción), podcasts, festivales, exhibiciones y debates artísticos** (cero cifras comerciales, cero venta de catálogos, cero hype).
   - **LONGITUD OBLIGATORIA:** entre **320 y 480 palabras** (obligatorio superar las 220 palabras y no pasar de 650), en **3 o 4 párrafos desarrollados** (~90-120 palabras cada uno) separados por doble salto de línea (\\n\\n).
   - **PERTENENCIA REAL AL PAÍS:** Si un medio publica historias de otros países, descártalas. Incluye solo hechos, obras, aniversarios/redescubrimientos o artistas vinculados concretamente con **${country.country}**.
   - **PROHIBIDO PALABRERÍO VACÍO:** Nunca escribas párrafos genéricos sin títulos de discos, películas, series, libros o nombres propios reales. Si mencionas una novedad o revelación, explica qué propone con datos concretos y sin adjetivos inflados.
   - **NEGRITAS OBLIGATORIAS CON CRITERIO:** Incluye **1 o 2 negritas por párrafo** (mínimo 3 en todo el texto) usando **texto** para destacar nombres propios clave o ideas centrales y facilitar la lectura. Nunca pongas negritas encima de un enlace [texto](...). Usa *cursiva* para títulos de discos, películas, series o libros cuando no vayan en negrita.
   - **ENLACES ÚTILES EN EL TEXTO (4 a 6):** Incluye entre **4 y 6 enlaces** sobre nombres propios de obras, discos, bandas, películas, series, libros, festivales o medios usando una de estas dos formas:
     a) [Nombre exacto](WIKI:Nombre exacto) para enlazar a Wikipedia de esa persona, banda, película, serie o libro (ej: [Fontaines D.C.](WIKI:Fontaines D.C.), [Sally Rooney](WIKI:Sally Rooney)).
     b) [Nombre exacto](ID) poniendo solo el número entero de la lista de arriba (ej: [Milano Music Week](9), priorizando los marcados como [SITIO EXTERNO] y las notas originales).
   - **PROHIBIDO USAR CITAS NUMÉRICAS:** Nunca insertes números entre corchetes como [1], [9], [10] o [25] en el texto ni detrás de un enlace o nombre propio.
5. "topics": Entre 3 y 5 bloques concretos (variando disciplinas según el eje: Música, Cine, Series, Libros, Podcasts, Festivales, Exhibiciones, Debates artísticos, y Cómics/Humor gráfico opcional sin stand-up).
   - Cada título y resumen debe nombrar **obras, discos, películas, libros o artistas concretos** (prohibido resumir listas como "los diez mejores libros" sin citar al menos 2 títulos/autores reales; prohibido notas de venta de derechos/contratos).
   - Puedes incluir **1 enlace** por tarjeta usando [Nombre exacto](WIKI:Nombre exacto) o [Nombre exacto](ID) para ir directo a la obra o nota.
6. "recommendation": Recomendación destacada ("Libro", "Película", "Exposición", "Autor", "Artista", "Movimiento", "Álbum" u "Obra teatral") coherente en su "type" con el contenido real, con "title", "creator", "source_id" (entero entre 1 y ${verifiedUrls.length}) y **"context"**: **1 sola frase bien breve y directa (entre 45 y 180 caracteres)** explicando por qué descubrirla ahora.
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
Redacta directamente la edición cultural semanal en español de **${country.country}** (${country.continent}) para la semana **${weekLabel}**, basándote EXCLUSIVAMENTE en las señales reales capturadas abajo que pertenezcan concretamente a **${country.country}** (sin inventar obras, personas ni datos, descartando noticias de negocios/contratos y señales incompletas donde falten nombres propios o contexto claro).

MEDIOS DE REFERENCIA EN ${country.country.toUpperCase()}:
${country.reference_media.join(", ")}

SEÑALES REALES CAPTURADAS ESTA SEMANA (múltiples fuentes):
${rssContext}
${antiRepeat}
${buildSharedJsonRules(country, verifiedUrls, youtubeCandidates, weekLabel)}
`.trim();
}