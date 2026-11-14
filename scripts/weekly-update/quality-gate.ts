import { CountryEditionSchema, type CountryEdition } from "../../src/lib/schema";

const AI_CLICHE_PATTERNS = [
  /en un mundo cada vez más/i,
  /sin lugar a dudas/i,
  /un fascinante viaje/i,
  /en conclusión,/i,
  /en definitiva,/i,
  /en suma,/i,
  /más allá de las fronteras/i,
  /testimonio vibrante/i,
  /tapiz cultural/i,
  /centro y periferia/i,
  /centro\/periferia/i,
  /descentralización/i,
  /homogeneización digital/i,
  /supervivencia identitaria/i,
  /arqueología del secreto/i,
  /estilización operística/i,
  /recordándonos que el arte/i,
  /^(?:por un lado|por otro lado|paralelamente|en paralelo|finalmente|asimismo),?\s/im,
];

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
        reason: `Detectado tono robótico o frase cliché prohibida (${pattern.source}). Reescribe de forma natural con obras y nombres propios concretos.`,
      };
    }
  }

  const inlineLinks = Array.from(
    edition.cultural_pulse.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)
  );
  if (inlineLinks.length < 2) {
    return {
      ok: false,
      reason: `Faltan enlaces dentro de cultural_pulse (incluyó ${inlineLinks.length}; obligatorio incluir 2 o 3 usando [Nombre](WIKI:Nombre) o [Nombre](ID)).`,
    };
  }
  if (inlineLinks.length > 3) {
    return {
      ok: false,
      reason: `Demasiados enlaces inline en cultural_pulse (${inlineLinks.length}); máximo permitido: 3.`,
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