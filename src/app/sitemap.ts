import type { MetadataRoute } from "next";
import {
  getAllCountrySummaries,
  getCountryEdition,
} from "@/lib/countries";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://jackpot-cultural-app.vercel.app");

export default function sitemap(): MetadataRoute.Sitemap {
  const countries = getAllCountrySummaries();

  const countryRoutes: MetadataRoute.Sitemap = countries.map((country) => {
    const edition = getCountryEdition(country.slug);
    return {
      url: `${SITE_URL}/pais/${country.slug}`,
      lastModified: edition?.updated_at
        ? new Date(edition.updated_at)
        : new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    };
  });

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...countryRoutes,
  ];
}