import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import {
  CountryEditionSchema,
  type CountryEdition,
  type CountrySourceConfig,
} from "../../src/lib/schema";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const COUNTRIES_DIR = path.join(process.cwd(), "content", "countries");
const OUT_DIR = path.join(process.cwd(), "public", "social-cards");

interface FontAsset {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

function stripEditorialMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 40 ? cut.slice(0, lastSpace) : cut}…`;
}

async function fetchBuffer(url: string, timeoutMs = 10000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "JackpotCulturalBot/1.0 (+https://jackpot-cultural-app.vercel.app)",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al descargar ${url}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(timer);
  }
}

async function loadFonts(): Promise<FontAsset[]> {
  const specs: {
    name: string;
    weight: 400 | 500 | 600 | 700;
    style: "normal" | "italic";
    urls: string[];
  }[] = [
    {
      name: "Newsreader",
      weight: 500,
      style: "normal",
      urls: [
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-500-normal.woff",
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader/files/newsreader-latin-500-normal.woff",
      ],
    },
    {
      name: "Newsreader",
      weight: 400,
      style: "italic",
      urls: [
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-400-italic.woff",
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader/files/newsreader-latin-400-italic.woff",
      ],
    },
    {
      name: "Inter",
      weight: 600,
      style: "normal",
      urls: [
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.0/files/inter-latin-600-normal.woff",
        "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-600-normal.woff",
      ],
    },
  ];

  const loaded: FontAsset[] = [];

  for (const spec of specs) {
    for (const url of spec.urls) {
      try {
        const buf = await fetchBuffer(url, 12000);
        const ab = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength
        ) as ArrayBuffer;
        loaded.push({
          name: spec.name,
          data: ab,
          weight: spec.weight,
          style: spec.style,
        });
        break;
      } catch {
        // Probar siguiente URL
      }
    }
  }

  if (loaded.length === 0) {
    throw new Error("No se pudieron descargar las fuentes para las placas.");
  }
  return loaded;
}

async function prepareCoverDataUri(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const raw = await fetchBuffer(url, 8000);
    const resized = await sharp(raw)
      .resize(940, 440, { fit: "cover", position: "attention" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderCard(
  edition: CountryEdition,
  fonts: FontAsset[]
): Promise<Buffer> {
  const coverUri = await prepareCoverDataUri(edition.cover_image?.url);
  const cleanIntro = truncateText(stripEditorialMarkdown(edition.intro), 175);
  const topics = edition.topics.slice(0, 3).map((t) => ({
    category: t.category.toUpperCase(),
    title: truncateText(stripEditorialMarkdown(t.title), 78),
  }));

  const tree = {
    type: "div",
    props: {
      style: {
        width: "1080px",
        height: "1350px",
        backgroundColor: "#F5F2EB",
        color: "#161615",
        display: "flex",
        flexDirection: "column",
        padding: "46px",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              border: "2px solid #161615",
              backgroundColor: "#FAF8F3",
              padding: "48px 52px",
            },
            children: [
              // Cabecera
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid #D6D0C4",
                          paddingBottom: "18px",
                          fontSize: "20px",
                          letterSpacing: "4px",
                          color: "#5C5952",
                          fontWeight: 600,
                        },
                        children: [
                          { type: "span", props: { children: "JACKPOT CULTURAL" } },
                          {
                            type: "span",
                            props: {
                              style: { color: "#B83827" },
                              children: edition.edition_week,
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          textAlign: "center",
                          marginTop: "28px",
                        },
                        children: [
                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "20px",
                                letterSpacing: "5px",
                                color: "#B83827",
                                fontWeight: 600,
                              },
                              children: edition.continent.toUpperCase(),
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                marginTop: "10px",
                                fontFamily: "Newsreader",
                                fontSize:
                                  edition.country.length > 12 ? "68px" : "80px",
                                fontWeight: 500,
                                lineHeight: 1.05,
                                letterSpacing: "-1px",
                              },
                              children: edition.country.toUpperCase(),
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                marginTop: "20px",
                                fontFamily: "Newsreader",
                                fontStyle: "italic",
                                fontSize: "30px",
                                lineHeight: 1.38,
                                color: "#2D2C29",
                                maxWidth: "840px",
                              },
                              children: cleanIntro,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },

              // Foto de portada (si existe)
              ...(coverUri
                ? [
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          marginTop: "24px",
                          border: "1px solid #161615",
                          backgroundColor: "#EFEAE0",
                          overflow: "hidden",
                          height: "360px",
                        },
                        children: [
                          {
                            type: "img",
                            props: {
                              src: coverUri,
                              style: {
                                width: "100%",
                                height: "360px",
                                objectFit: "cover",
                              },
                            },
                          },
                        ],
                      },
                    },
                  ]
                : []),

              // Temas destacados
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    marginTop: "24px",
                    borderTop: "2px solid #161615",
                    paddingTop: "20px",
                    gap: "14px",
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        style: {
                          fontSize: "18px",
                          letterSpacing: "4px",
                          color: "#5C5952",
                          fontWeight: 600,
                        },
                        children: "EN ESTA EDICIÓN",
                      },
                    },
                    ...topics.map((topic) => ({
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          borderLeft: "4px solid #B83827",
                          paddingLeft: "16px",
                        },
                        children: [
                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "15px",
                                letterSpacing: "3px",
                                color: "#B83827",
                                fontWeight: 600,
                              },
                              children: topic.category,
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: {
                                fontFamily: "Newsreader",
                                fontSize: "26px",
                                lineHeight: 1.25,
                                color: "#161615",
                                marginTop: "2px",
                              },
                              children: topic.title,
                            },
                          },
                        ],
                      },
                    })),
                  ],
                },
              },

              // Pie
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid #D6D0C4",
                    paddingTop: "18px",
                    marginTop: "18px",
                    fontSize: "19px",
                    color: "#5C5952",
                    fontWeight: 600,
                  },
                  children: [
                    {
                      type: "span",
                      props: {
                        children: `jackpot-cultural-app.vercel.app/pais/${edition.slug}`,
                      },
                    },
                    {
                      type: "span",
                      props: {
                        style: { color: "#B83827" },
                        children: "EDICIÓN SEMANAL",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1080,
    height: 1350,
    fonts,
  });

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fonts = await loadFonts();

  const configs = JSON.parse(
    fs.readFileSync(SOURCES_PATH, "utf-8")
  ) as CountrySourceConfig[];

  let generated = 0;

  for (const cfg of configs) {
    const filePath = path.join(COUNTRIES_DIR, `${cfg.slug}.json`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const parsed = CountryEditionSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`  [Skip] ${cfg.slug}: esquema inválido.`);
        continue;
      }

      const jpg = await renderCard(parsed.data, fonts);
      const outPath = path.join(OUT_DIR, `${cfg.slug}.jpg`);
      fs.writeFileSync(outPath, jpg);
      generated++;
      console.log(`  ✓ Placa generada: public/social-cards/${cfg.slug}.jpg`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ Error generando placa de ${cfg.slug}: ${msg}`);
    }
  }

  console.log(`=== Placas generadas: ${generated}/${configs.length} ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});