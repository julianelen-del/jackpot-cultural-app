import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Headphones,
  ListMusic,
  Lock,
  PlayCircle,
  Radio,
  RotateCw,
} from "lucide-react";
import {
  getAllCountrySummaries,
  getCountriesGroupedByContinent,
  getCountryConfigBySlug,
  getCountryEdition,
} from "@/lib/countries";
import { EditorialNav } from "@/components/EditorialNav";
import { ShareEditionButton } from "@/components/ShareEditionButton";

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
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
    .replace(/\*/g, "");
  const words = plain.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 200));
}

function renderEditorialText(text: string) {
  const normalized = text
    .replace(/\*\*(\[[^\]]+\]\([^)]+\))\*\*/g, "$1")
    .replace(/\*(\[[^\]]+\]\([^)]+\))\*/g, "$1")
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "");

  const tokenRegex =
    /(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(normalized.slice(lastIndex, match.index).replace(/\*/g, ""));
    }

    const token = match[0];
    if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`${match.index}-${linkMatch[2]}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline decoration-accent/50 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
          >
            {linkMatch[1].replace(/\*/g, "")}
          </a>
        );
      } else {
        parts.push(token.replace(/\*/g, ""));
      }
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={`em-${match.index}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < normalized.length) {
    parts.push(normalized.slice(lastIndex).replace(/\*/g, ""));
  }

  return parts.length > 0 ? parts : normalized.replace(/\*/g, "");
}

function pickIconForKind(kind?: string) {
  const lower = (kind || "").toLowerCase();
  if (lower.includes("video") || lower.includes("streaming")) return PlayCircle;
  if (lower.includes("podcast")) return Headphones;
  if (lower.includes("selección") || lower.includes("playlist")) return ListMusic;
  return Radio;
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

  const weekMatch = edition.edition_week.match(/W(\d+)/);
  const weekNumber = weekMatch ? Number(weekMatch[1]) : 0;
  const rotatingList = config.listening?.rotating || [];
  const rotatedItem =
    rotatingList.length > 0
      ? rotatingList[weekNumber % rotatingList.length]
      : null;

  const listeningItems = [
    config.listening?.radio
      ? {
          kind: config.listening.radio.kind || "Radio",
          icon: Radio,
          ...config.listening.radio,
        }
      : null,
    config.listening?.radio_alt
      ? {
          kind: config.listening.radio_alt.kind || "Radio",
          icon: Radio,
          ...config.listening.radio_alt,
        }
      : null,
    config.listening?.podcast
      ? {
          kind: config.listening.podcast.kind || "Podcast",
          icon: Headphones,
          ...config.listening.podcast,
        }
      : null,
    config.listening?.playlist
      ? {
          kind: config.listening.playlist.kind || "Selección musical",
          icon: ListMusic,
          ...config.listening.playlist,
        }
      : null,
    rotatedItem
      ? {
          kind: rotatedItem.kind || "Para escuchar",
          icon: pickIconForKind(rotatedItem.kind),
          ...rotatedItem,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

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
            {renderEditorialText(edition.intro)}
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
                {renderEditorialText(paragraph)}
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

          <div
            className={`grid gap-x-10 gap-y-8 ${
              edition.topics.length === 2 || edition.topics.length === 4
                ? "md:grid-cols-2"
                : "md:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {edition.topics.map((topic, idx) => (
              <div key={idx} className="border-t border-hairline pt-4">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-accent uppercase">
                  {topic.category}
                </p>
                <h3 className="mt-2 font-serif text-2xl leading-snug font-medium text-ink">
                  {renderEditorialText(topic.title)}
                </h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
                  {renderEditorialText(topic.summary)}
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
            {renderEditorialText(edition.recommendation.context)}
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

        {listeningItems.length > 0 && (
          <section
            aria-labelledby="listening-heading"
            className="mx-auto mt-16 max-w-3xl border-t border-hairline pt-8"
          >
            <div className="mb-5 flex items-baseline justify-between gap-2">
              <h2
                id="listening-heading"
                className="text-[11px] font-semibold tracking-[0.2em] text-ink-muted uppercase"
              >
                Para escuchar y ver en {edition.country}
              </h2>
              <span className="font-serif text-xs italic text-ink-muted">
                Aire local, podcasts y sesiones
              </span>
            </div>

            <div
              className={`grid gap-4 ${
                listeningItems.length === 1
                  ? "grid-cols-1"
                  : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {listeningItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={`${item.kind}-${item.name}`}
                    className="flex flex-col justify-between border border-ink/15 bg-paper-warm/50 p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.16em] text-accent uppercase">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{item.kind}</span>
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-ink-muted transition-colors hover:text-accent"
                        >
                          <span>Sitio</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </div>

                      <h3 className="mt-2 font-serif text-lg font-medium text-ink">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition-colors hover:text-accent"
                        >
                          {item.name}
                        </a>
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {item.description}
                      </p>
                    </div>

                    {item.embed_url ? (
                      <div className="mt-3 overflow-hidden border border-ink/10 bg-paper">
                        <iframe
                          src={item.embed_url}
                          title={item.name}
                          className="h-44 w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          loading="lazy"
                          allowFullScreen
                        />
                      </div>
                    ) : item.audio_url ? (
                      <div className="mt-3">
                        <audio
                          controls
                          preload="none"
                          src={item.audio_url}
                          className="h-9 w-full"
                        >
                          Tu navegador no soporta audio integrado.
                        </audio>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
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
              <ShareEditionButton
                country={edition.country}
                slug={edition.slug}
                editionWeek={edition.edition_week}
              />
              <Link
                href="/"
                className="border border-ink/30 px-6 py-3 text-xs font-medium tracking-[0.16em] text-ink uppercase transition-colors hover:border-ink"
              >
                Ir a la portada
              </Link>
            </div>
          </div>

          <div className="mt-10 space-y-3 border-t border-hairline pt-6 text-center text-xs text-ink-muted">
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.12em] uppercase">
              <a
                href="https://open.spotify.com/show/3IZq9eN3261zhdNGyCRE79"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent transition-opacity hover:opacity-75"
              >
                Pódcast en Spotify
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://www.instagram.com/jackpotcultural/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-ink"
              >
                Instagram
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://www.threads.net/@jackpotcultural"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-ink"
              >
                Threads
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://www.facebook.com/1398558576677562"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-ink"
              >
                Facebook
              </a>
            </p>
            <p>
              Prensa, envíos de libros, discos e invitaciones:{" "}
              <a
                href="mailto:jackpotcultural@gmail.com"
                className="font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
              >
                jackpotcultural@gmail.com
              </a>
            </p>
          </div>
        </footer>
      </article>
    </div>
  );
}