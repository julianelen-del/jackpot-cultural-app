import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Lock, RotateCw } from "lucide-react";
import {
  getAllCountrySummaries,
  getCountriesGroupedByContinent,
  getCountryConfigBySlug,
  getCountryEdition,
} from "@/lib/countries";
import { EditorialNav } from "@/components/EditorialNav";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllCountrySummaries().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const config = getCountryConfigBySlug(slug);
  if (!config) {
    return { title: "País no encontrado — JACKPOT CULTURAL" };
  }
  const edition = getCountryEdition(slug);
  return {
    title: `${config.flag} ${config.country} — JACKPOT CULTURAL`,
    description:
      edition?.intro ||
      `El pulso cultural de ${config.country} esta semana en JACKPOT CULTURAL.`,
    openGraph: {
      title: `${config.flag} ${config.country} — JACKPOT CULTURAL`,
      description:
        edition?.intro ||
        `El pulso cultural de ${config.country} esta semana.`,
      ...(edition?.cover_image
        ? { images: [{ url: edition.cover_image.url }] }
        : {}),
    },
  };
}

function formatEditorialDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(isoDate));
  } catch {
    return isoDate.slice(0, 10);
  }
}

function estimateReadingMinutes(text: string): number {
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}

function renderInlineLinks(paragraph: string) {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(paragraph)) !== null) {
    if (match.index > lastIndex) {
      parts.push(paragraph.slice(lastIndex, match.index));
    }
    parts.push(
      <a
        key={`${match.index}-${match[2]}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-accent/45 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < paragraph.length) {
    parts.push(paragraph.slice(lastIndex));
  }

  return parts.length > 0 ? parts : paragraph;
}

export default async function CountryPage({ params }: PageProps) {
  const { slug } = await params;
  const config = getCountryConfigBySlug(slug);
  if (!config) notFound();

  const groupedCountries = getCountriesGroupedByContinent();
  const edition = getCountryEdition(slug);

  if (!edition) {
    return (
      <div className="min-h-dvh bg-paper">
        <EditorialNav groupedCountries={groupedCountries} currentSlug={slug} />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="text-5xl" aria-hidden="true">
            {config.flag}
          </p>
          <p className="mt-4 text-[11px] font-medium tracking-[0.2em] text-ink-muted uppercase">
            {config.continent}
          </p>
          <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            {config.country}
          </h1>
          <p className="mt-6 font-serif text-lg italic text-ink-muted">
            La edición semanal de {config.country} todavía no fue generada.
            Ejecutá la actualización semanal desde GitHub Actions para
            publicarla.
          </p>
          <Link
            href="/?spin=1"
            className="mt-8 inline-block border border-ink bg-accent px-6 py-3 text-xs font-semibold tracking-[0.18em] text-paper uppercase transition-colors hover:bg-[#9E2E20]"
          >
            Probar otro país
          </Link>
        </main>
      </div>
    );
  }

  const pulseParagraphs = edition.cultural_pulse
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const readingMinutes = estimateReadingMinutes(edition.cultural_pulse);

  return (
    <div className="min-h-dvh bg-paper pb-24">
      <EditorialNav groupedCountries={groupedCountries} currentSlug={slug} />

      <article className="mx-auto max-w-5xl px-4 pt-10 sm:px-8 sm:pt-16">
        <header className="mx-auto max-w-3xl border-b-2 border-ink pb-8 text-center sm:pb-12">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.18em] text-ink-muted uppercase">
            <span className="text-accent">{edition.continent}</span>
            <span aria-hidden="true">·</span>
            <span>Edición {edition.edition_week}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={edition.updated_at}>
              Actualizado el {formatEditorialDate(edition.updated_at)}
            </time>
            <span aria-hidden="true">·</span>
            <span>{readingMinutes} min de lectura</span>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:mt-8">
            <span className="text-5xl leading-none sm:text-6xl" aria-hidden="true">
              {edition.flag}
            </span>
            <h1 className="font-serif text-5xl font-medium tracking-tight text-ink uppercase sm:text-7xl">
              {edition.country}
            </h1>
          </div>

          <p className="mx-auto mt-5 max-w-2xl font-serif text-xl leading-relaxed italic text-ink/85 sm:text-2xl">
            {edition.intro}
          </p>
        </header>

        {edition.cover_image && (
          <figure className="mx-auto mt-10 max-w-4xl">
            <div className="overflow-hidden border border-ink/15 bg-paper-warm">
              <img
                src={edition.cover_image.url}
                alt={edition.cover_image.caption}
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
            <figcaption className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-2.5 text-xs text-ink-muted">
              <span className="font-serif italic">
                {edition.cover_image.caption}
              </span>
              <span className="text-[11px] tracking-wide">
                {edition.cover_image.credit}
              </span>
            </figcaption>
          </figure>
        )}

        <section
          aria-labelledby="pulse-heading"
          className="mx-auto mt-12 max-w-[65ch] sm:mt-16"
        >
          <h2
            id="pulse-heading"
            className="mb-7 border-b border-hairline pb-3 text-[11px] font-semibold tracking-[0.2em] text-accent uppercase"
          >
            El pulso cultural de la semana
          </h2>

          <div className="space-y-6 font-serif text-[19px] leading-[1.78] text-ink/95 sm:text-[20px]">
            {pulseParagraphs.map((paragraph, idx) => (
              <p
                key={idx}
                className={idx === 0 ? "editorial-dropcap" : undefined}
              >
                {renderInlineLinks(paragraph)}
              </p>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="topics-heading"
          className="mt-16 border-t-2 border-ink pt-10 sm:mt-20"
        >
          <div className="mb-8 flex items-baseline justify-between">
            <h2
              id="topics-heading"
              className="text-[11px] font-semibold tracking-[0.2em] text-ink uppercase"
            >
              Temas destacados
            </h2>
            <span className="font-serif text-sm italic text-ink-muted">
              Conversaciones de la escena local
            </span>
          </div>

          <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {edition.topics.map((topic, idx) => (
              <div key={idx} className="border-t border-hairline pt-4">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-accent uppercase">
                  {topic.category}
                </p>
                <h3 className="mt-2 font-serif text-2xl leading-snug font-medium text-ink">
                  {topic.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
                  {topic.summary}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="discover-heading"
          className="mx-auto mt-16 max-w-3xl border border-ink/25 bg-paper-warm p-7 sm:mt-20 sm:p-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-3">
            <h2
              id="discover-heading"
              className="text-[11px] font-semibold tracking-[0.2em] text-ink uppercase"
            >
              Para descubrir
            </h2>
            <span className="border border-accent/40 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.15em] text-accent uppercase">
              {edition.recommendation.type}
            </span>
          </div>

          <h3 className="mt-5 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            {edition.recommendation.title}
          </h3>
          <p className="mt-1 font-serif text-lg italic text-ink-muted">
            {edition.recommendation.creator}
          </p>

          <p className="mt-4 text-base leading-relaxed text-ink/90">
            {edition.recommendation.context}
          </p>

          <div className="mt-6">
            <a
              href={edition.recommendation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border-b border-ink pb-0.5 text-xs font-semibold tracking-[0.15em] text-ink uppercase transition-colors hover:border-accent hover:text-accent"
            >
              <span>Explorar referencia</span>
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* PIEZA VISUAL O AUDIOVISUAL OPCIONAL DESPUÉS DE TODOS LOS TEXTOS */}
        {edition.closing_media && (
          <figure className="mx-auto mt-14 max-w-3xl">
            {edition.closing_media.type === "video" ? (
              <div className="aspect-video overflow-hidden border border-ink/15 bg-ink">
                <iframe
                  src={edition.closing_media.url}
                  title={edition.closing_media.caption}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex justify-center overflow-hidden border border-ink/15 bg-paper-warm/60 p-3 sm:p-5">
                <img
                  src={edition.closing_media.url}
                  alt={edition.closing_media.caption}
                  className="max-h-[460px] w-auto max-w-full object-contain"
                />
              </div>
            )}
            <figcaption className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-2.5 text-xs text-ink-muted">
              <span className="font-serif italic">
                {edition.closing_media.caption}
              </span>
              {edition.closing_media.credit && (
                <span className="text-[11px] tracking-wide">
                  {edition.closing_media.credit}
                </span>
              )}
            </figcaption>
          </figure>
        )}

        <footer className="mx-auto mt-16 max-w-3xl border-t border-hairline pt-8">
          <h2 className="text-[11px] font-semibold tracking-[0.2em] text-ink-muted uppercase">
            Fuentes consultadas
          </h2>

          <ul className="mt-4 divide-y divide-hairline">
            {edition.sources.map((source, idx) => (
              <li
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-ink">{source.name}</span>
                  {source.paywalled && (
                    <span
                      title="Medio con suscripción / muro de pago"
                      className="inline-flex items-center gap-1 border border-hairline px-2 py-0.5 text-[10px] tracking-[0.08em] text-ink-muted uppercase"
                    >
                      <Lock className="h-2.5 w-2.5" />
                      Suscripción
                    </span>
                  )}
                </div>

                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <span>Visitar medio</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-14 border-t border-ink/20 pt-10 text-center">
            <p className="font-serif text-lg italic text-ink-muted">
              ¿Seguimos viajando?
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/?spin=1"
                className="inline-flex items-center gap-2 border border-ink bg-accent px-6 py-3 text-xs font-semibold tracking-[0.18em] text-paper uppercase transition-colors hover:bg-[#9E2E20]"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Volver a tirar</span>
              </Link>
              <Link
                href="/"
                className="border border-ink/30 px-6 py-3 text-xs font-medium tracking-[0.16em] text-ink uppercase transition-colors hover:border-ink"
              >
                Ir a la portada
              </Link>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}