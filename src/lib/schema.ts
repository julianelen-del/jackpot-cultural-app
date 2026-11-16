import { z } from "zod";

export const CONTINENTS = [
  "América",
  "Europa",
  "Asia",
  "África",
  "Oceanía",
] as const;

export const TopicSchema = z.object({
  category: z.string().min(2).max(40),
  title: z.string().min(5).max(120),
  summary: z.string().min(50).max(550),
});

export const RecommendationSchema = z.object({
  type: z.enum([
    "Libro",
    "Película",
    "Exposición",
    "Autor",
    "Artista",
    "Movimiento",
    "Álbum",
    "Obra teatral",
  ]),
  title: z.string().min(2).max(140),
  creator: z.string().min(2).max(120),
  context: z.string().min(35).max(220),
  url: z.string().url(),
});

export const SourceSchema = z.object({
  name: z.string().min(2).max(90),
  url: z.string().url(),
  paywalled: z.boolean(),
});

export const CoverImageSchema = z.object({
  url: z.string().url(),
  caption: z.string().min(5).max(200),
  credit: z.string().min(3).max(140),
});

export const ClosingMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url(),
  caption: z.string().min(5).max(200),
  credit: z.string().max(140).optional(),
});

export const CountryEditionSchema = z.object({
  slug: z.string().min(2),
  country: z.string().min(2),
  continent: z.enum(CONTINENTS),
  flag: z.string().min(1),
  updated_at: z.string().datetime(),
  edition_week: z.string().min(4),
  intro: z.string().min(30).max(240),
  cover_image: CoverImageSchema.optional(),
  cultural_pulse: z.string().refine(
    (text) => {
      const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      const words = plain.trim().split(/\s+/).filter(Boolean).length;
      return words >= 150 && words <= 700;
    },
    { message: "El pulso cultural debe tener entre 150 y 700 palabras." }
  ),
  topics: z.array(TopicSchema).min(3).max(5),
  recommendation: RecommendationSchema,
  closing_media: ClosingMediaSchema.optional(),
  sources: z.array(SourceSchema).min(2).max(8),
});

export type Continent = (typeof CONTINENTS)[number];
export type Topic = z.infer<typeof TopicSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CoverImage = z.infer<typeof CoverImageSchema>;
export type ClosingMedia = z.infer<typeof ClosingMediaSchema>;
export type CountryEdition = z.infer<typeof CountryEditionSchema>;

export interface ListeningItem {
  kind?: string;
  name: string;
  url: string;
  description: string;
  audio_url?: string;
  embed_url?: string;
}

export interface CountryListeningConfig {
  radio?: ListeningItem;
  radio_alt?: ListeningItem;
  podcast?: ListeningItem;
  playlist?: ListeningItem;
  rotating?: ListeningItem[];
}

export interface CountrySourceConfig {
  slug: string;
  country: string;
  continent: Continent;
  flag: string;
  languages: string[];
  rss_feeds: string[];
  reference_media: string[];
  listening?: CountryListeningConfig;
}