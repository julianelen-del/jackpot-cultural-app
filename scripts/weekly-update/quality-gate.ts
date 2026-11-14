import { CountryEditionSchema, type CountryEdition } from "../../src/lib/schema";

const AI_CLICHE_PATTERNS = [
  /en un mundo cada vez más/i,
  /sin lugar a dudas/i,
  /un fascinante viaje/i,
  /en conclusión,/i,
  /en definitiva,/i,
  /más allá de las fronteras/i,
  /testimonio vibrante/i,
  /tapiz cultural/i,
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

  // Verificar ausencia de clichés de IA
  for (const pattern of AI_CLICHE_PATTERNS) {
    if (pattern.test(edition.cultural_pulse)) {
      return {
        ok: false,
        reason: `Detectado cliché de IA en cultural_pulse (${pattern.source})`,
      };
    }
  }

  // Verificar que los enlaces no hayan sido inventados por el modelo
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