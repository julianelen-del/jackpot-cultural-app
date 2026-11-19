import { CountryEditionSchema, type CountryEdition } from "../../src/lib/schema";

const AI_CLICHE_PATTERNS = [
  /en un mundo cada vez más/i,
  /sin lugar a dudas/i,
  /un fascinante viaje/i,
  /más allá de las fronteras/i,
  /testimonio vibrante/i,
  /tapiz cultural/i,
  /centro y periferia/i,
  /centro\/periferia/i,
  /homogeneización digital/i,
  /supervivencia identitaria/i,
  /arqueología del secreto/i,
  /estilización operística/i,
  /diálogo entre tradición y vanguardia/i,
  /completan el mapa semanal/i,
  /recordándonos que el arte/i,
  /próxima gran sensación/i,
  /fenómeno imparable/i,
  /marcando el pulso global/i,
  /cada etapa más/i,
];

const VAGUE_PHRASE_PATTERNS = [
  /talento local/i,
  /propuestas sonoras/i,
  /estrenos recientes en cartelera/i,
  /universos de franquicia/i,
  /repartos estelares/i,
  /otros autores esenciales/i,
  /diversidad de propuestas/i,
  /fricciones estéticas/i,
  /discusión pública/i,
  /fórmulas estandarizadas/i,
  /mapa sonoro/i,
  /escrutinio crítico/i,
  /códigos genéricos/i,
  /inventiva rítmica/i,
  /colisiones estilísticas/i,
  /mera celebración comercial/i,
  /listas de reproducción locales/i,
  /balances de los temas/i,
  /impacto cultural y sonoro/i,
];

const GENERIC_CAPTION_PATTERNS = [
  /retrato editorial/i,
  /vinculado al debate/i,
  /imagen ilustrativa/i,
  /^escena cultural (actual )?en\b/i,
];

const LEAKED_CITATION_PATTERN =
  /(?:\(\d{1,2}\)|\[\d{1,2}\])(?=[.,;:\s]|$)/;

const NON_PROPER_CAPS = new Set([
  "El",
  "La",
  "Los",
  "Las",
  "Un",
  "Una",
  "Unos",
  "Unas",
  "En",
  "De",
  "Del",
  "Al",
  "Por",
  "Para",
  "Con",
  "Sin",
  "Sobre",
  "Entre",
  "Tras",
  "Hacia",
  "Ante",
  "Bajo",
  "Según",
  "Como",
  "Más",
  "Menos",
  "Muy",
  "Todo",
  "Toda",
  "Todos",
  "Todas",
  "Este",
  "Esta",
  "Estos",
  "Estas",
  "Ese",
  "Esa",
  "Nuevo",
  "Nueva",
  "Nuevos",
  "Nuevas",
  "Gran",
  "Grandes",
  "Mejores",
  "Diez",
  "Cinco",
  "Tres",
  "Cuatro",
  "Veinte",
  "Presencia",
  "Debate",
  "Debates",
  "Lecturas",
  "Lectura",
  "Análisis",
  "Crítica",
  "Industria",
  "Escena",
  "Cultura",
  "Música",
  "Cine",
  "Series",
  "Libros",
  "Arte",
  "Teatro",
  "Festival",
  "Festivales",
  "Literatura",
  "Balances",
  "Balance",
  "Repaso",
  "Resumen",
  "Panorama",
  "Mapa",
  "Lista",
  "Listas",
  "Temporada",
  "Sencillos",
  "Canciones",
  "Éxitos",
  "Premios",
  "Tráiler",
  "Cartelera",
  "Lanzamientos",
  "Estrenos",
  "Tendencias",
  "Novedades",
  "Edición",
  "Claves",
  "Voces",
  "Sonidos",
  "Rutas",
  "Itinerarios",
  "Miradas",
  "Crónicas",
  "Historia",
  "Actualidad",
  "Cierre",
  "Obras",
  "Artistas",
  "Bandas",
  "Discos",
  "Películas",
  "Recomendaciones",
  "Muestra",
  "Ciclo",
  "Homenaje",
  "Aniversario",
  "Lejos",
  "Además",
  "Mientras",
  "Aunque",
  "Durante",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getCategoryBucket(category: string): string {
  const norm = normalizeText(category);
  if (
    /(libro|literatura|novela|ensayo|poesia|cronica|editorial|ficcion|lectura)/.test(
      norm
    )
  ) {
    return "libros";
  }
  if (
    /(musica|rock|indie|pop|jazz|electronica|hip hop|rap|folklore|discos|cancion)/.test(
      norm
    )
  ) {
    return "musica";
  }
  if (/(cine|serie|television|tv|documental|audiovisual)/.test(norm)) {
    return "cine_series";
  }
  if (
    /(teatro|arte|exhibicion|exposicion|museo|arquitectura|danza|fotografia)/.test(
      norm
    )
  ) {
    return "artes_escena";
  }
  if (/(festival|feria)/.test(norm)) {
    return "festivales";
  }
  if (/(podcast|radio|audio)/.test(norm)) {
    return "podcasts";
  }
  if (/(comic|historieta|humor grafico)/.test(norm)) {
    return "comics";
  }
  return norm;
}

function hasConcreteProperNoun(
  text: string,
  countryName: string,
  continentName: string
): boolean {
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const matches = plain.match(
    /\b[A-ZÁÉÍÓÚÑÜ][a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9'’-]{2,}\b/g
  );
  if (!matches) return false;

  const ignoredGeoTokens = new Set(
    `${countryName} ${continentName}`
      .split(/\s+/)
      .map((w) => normalizeText(w))
      .filter((w) => w.length > 2)
  );

  return matches.some((word) => {
    if (NON_PROPER_CAPS.has(word)) return false;
    if (ignoredGeoTokens.has(normalizeText(word))) return false;
    return true;
  });
}

function hasLeakedCitation(text: string): boolean {
  const withoutLinks = text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1");
  return LEAKED_CITATION_PATTERN.test(withoutLinks);
}

export function validateEditionQuality(
  rawEdition: unknown,
  allowedUrls: Set<string>
): { ok: true; data: CountryEdition } | { ok: false; reason: string } {
  const parsed = CountryEditionSchema.safeParse(rawEdition);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" | ");
    return { ok: false, reason: `Validación de esquema falló: ${issues}` };
  }

  const edition = parsed.data;

  if (
    hasLeakedCitation(edition.intro) ||
    hasLeakedCitation(edition.cultural_pulse) ||
    hasLeakedCitation(edition.recommendation.context)
  ) {
    return {
      ok: false,
      reason:
        "Se detectó un número de cita suelto como (1), (20) o [1]. Los números de fuente solo pueden ir dentro de un enlace [Nombre exacto](ID), nunca como texto entre paréntesis o corchetes.",
    };
  }

  for (const pattern of AI_CLICHE_PATTERNS) {
    if (pattern.test(edition.cultural_pulse)) {
      return {
        ok: false,
        reason: `Detectado cliché o expresión artificial (${pattern.source}). Reescribe en español natural con obras y nombres propios concretos.`,
      };
    }
  }

  for (const pattern of VAGUE_PHRASE_PATTERNS) {
    if (pattern.test(edition.cultural_pulse)) {
      return {
        ok: false,
        reason: `Detectada vaguedad genérica (${pattern.source}) en cultural_pulse. Nombra obras, bandas, discos, libros o directores concretos.`,
      };
    }
  }

  const captionsToCheck = [
    edition.cover_image?.caption,
    edition.closing_media?.caption,
  ].filter((c): c is string => Boolean(c));

  for (const cap of captionsToCheck) {
    for (const pattern of GENERIC_CAPTION_PATTERNS) {
      if (pattern.test(cap)) {
        return {
          ok: false,
          reason: `Epígrafe demasiado genérico ("${cap}"). Debe nombrar explícitamente a la persona, banda, obra o lugar que aparece en la imagen o video.`,
        };
      }
    }
  }

  const boldMatches = Array.from(
    edition.cultural_pulse.matchAll(/\*\*([^*\n]{2,80})\*\*/g)
  );
  if (boldMatches.length < 2) {
    return {
      ok: false,
      reason: `Faltan negritas en cultural_pulse (incluyó ${boldMatches.length}; obligatorio destacar al menos 2 nombres propios o ideas clave usando **texto**, sin ponerlas encima de enlaces).`,
    };
  }

  const inlineLinks = Array.from(
    edition.cultural_pulse.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)
  );
  if (inlineLinks.length < 2) {
    return {
      ok: false,
      reason: `Faltan enlaces dentro de cultural_pulse (incluyó ${inlineLinks.length}; obligatorio incluir al menos 2 —ideal 4 a 6— usando [Nombre](WIKI:Nombre) o [Nombre](ID)).`,
    };
  }
  if (inlineLinks.length > 6) {
    return {
      ok: false,
      reason: `Demasiados enlaces inline en cultural_pulse (${inlineLinks.length}); máximo permitido: 6.`,
    };
  }
  for (const match of inlineLinks) {
    if (!allowedUrls.has(match[2])) {
      return {
        ok: false,
        reason: `Enlace inline fuera de lista verificada: ${match[2]}`,
      };
    }
  }

  const pulseParagraphs = edition.cultural_pulse
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = 0; i < pulseParagraphs.length; i++) {
    const p = pulseParagraphs[i];
    const hasHighlight =
      /\*\*[^*\n]{2,80}\*\*/.test(p) ||
      /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(p);

    if (
      !hasHighlight ||
      !hasConcreteProperNoun(p, edition.country, edition.continent)
    ) {
      return {
        ok: false,
        reason: `El párrafo ${i + 1} de cultural_pulse es demasiado abstracto o no destaca obras/autores concretos. Si no hay otro tema concreto, usa 2 párrafos densos en lugar de agregar un cierre genérico.`,
      };
    }
  }

  const seenBuckets = new Set<string>();

  for (let i = 0; i < edition.topics.length; i++) {
    const topic = edition.topics[i];
    const combined = `${topic.title} ${topic.summary}`;

    if (hasLeakedCitation(combined)) {
      return {
        ok: false,
        reason: `El tema destacado "${topic.title}" incluye una cita numérica suelta como (1) o [1]. Elimínala o conviértela en [Nombre](ID).`,
      };
    }

    const bucket = getCategoryBucket(topic.category);
    if (seenBuckets.has(bucket)) {
      return {
        ok: false,
        reason: `Categorías repetidas o solapadas en Temas destacados ("${topic.category}"). Usa disciplinas distintas (ej. Música, Cine y Series, Libros). Si solo hay 2 disciplinas fuertes, incluye 2 tarjetas.`,
      };
    }
    seenBuckets.add(bucket);

    for (const pattern of [...AI_CLICHE_PATTERNS, ...VAGUE_PHRASE_PATTERNS]) {
      if (pattern.test(combined)) {
        return {
          ok: false,
          reason: `El tema destacado "${topic.title}" usa una vaguedad prohibida (${pattern.source}). Reemplázalo con títulos de obras y autores concretos del país.`,
        };
      }
    }

    if (!hasConcreteProperNoun(combined, edition.country, edition.continent)) {
      return {
        ok: false,
        reason: `El tema destacado "${topic.title}" es demasiado vago: no nombra ningún artista, banda, libro, película, serie o festival concreto.`,
      };
    }

    const topicLinks = Array.from(
      combined.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)
    );
    for (const match of topicLinks) {
      if (!allowedUrls.has(match[2])) {
        return {
          ok: false,
          reason: `Enlace en tema destacado fuera de lista verificada: ${match[2]}`,
        };
      }
    }
  }

  if (!allowedUrls.has(edition.recommendation.url)) {
    return {
      ok: false,
      reason: `URL de recomendación fuera de lista verificada: ${edition.recommendation.url}`,
    };
  }

  for (const src of edition.sources) {
    if (!allowedUrls.has(src.url)) {
      return {
        ok: false,
        reason: `URL de fuente fuera de lista verificada: ${src.url}`,
      };
    }
  }

  return { ok: true, data: edition };
}