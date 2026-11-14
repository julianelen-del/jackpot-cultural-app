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
  summary: z.string().min(50).max(420),
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
  context: z.string().min(50).max(420),
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
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      return words >= 300 && words <= 800;
    },
    { message: "El pulso cultural debe tener entre 300 y 800 palabras." }
  ),
  topics: z.array(TopicSchema).min(3).max(5),
  recommendation: RecommendationSchema,
  sources: z.array(SourceSchema).min(2).max(8),
});

export type Continent = (typeof CONTINENTS)[number];
export type Topic = z.infer<typeof TopicSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CoverImage = z.infer<typeof CoverImageSchema>;
export type CountryEdition = z.infer<typeof CountryEditionSchema>;

export interface CountrySourceConfig {
  slug: string;
  country: string;
  continent: Continent;
  flag: string;
  languages: string[];
  rss_feeds: string[];
  reference_media: string[];
}