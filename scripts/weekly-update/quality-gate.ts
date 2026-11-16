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
];

const GENERIC_CAPTION_PATTERNS = [
  /retrato editorial/i,
  /vinculado al debate/i,
  /imagen ilustrativa/i,
  /^escena cultural (actual )?en\b/i,
];

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
  "Presencia",
  "Debate",
  "Debates",
  "Lecturas",
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
]);

function hasConcreteProperNoun(text: string): boolean {
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const matches = plain.match(
    /\b[A-ZÁÉÍÓÚÑÜ][a-záéíóúñüA-ZÁÉÍÓÚÑÜ0-9'’-]{2,}\b/g
  );
  if (!matches) return false;
  return matches.some((word) => !NON_PROPER_CAPS.has(word));
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

  for (const pattern of AI_CLICHE_PATTERNS) {
    if (pattern.test(edition.cultural_pulse)) {
      return {
        ok: false,
        reason: `Detectado cliché o hype prohibido (${pattern.source}). Reescribe con obras y nombres propios concretos.`,
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
  if (boldMatches.length < 1) {
    return {
      ok: false,
      reason: `Faltan negritas en cultural_pulse (obligatorio destacar al menos 2 nombres propios o ideas clave usando **texto**, sin ponerlas encima de enlaces).`,
    };
  }

  const inlineLinks = Array.from(
    edition.cultural_pulse.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)
  );
  if (inlineLinks.length < 1) {
    return {
      ok: false,
      reason: `Faltan enlaces dentro de cultural_pulse (incluyó 0; obligatorio incluir 4 a 6 usando [Nombre](WIKI:Nombre) o [Nombre](ID)).`,
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

  for (let i = 0; i < edition.topics.length; i++) {
    const topic = edition.topics[i];
    const combined = `${topic.title} ${topic.summary}`;

    for (const pattern of [...AI_CLICHE_PATTERNS, ...VAGUE_PHRASE_PATTERNS]) {
      if (pattern.test(combined)) {
        return {
          ok: false,
          reason: `El tema destacado "${topic.title}" usa una vaguedad prohibida (${pattern.source}). Reemplázalo con títulos de obras y autores concretos del país.`,
        };
      }
    }

    if (!hasConcreteProperNoun(combined)) {
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