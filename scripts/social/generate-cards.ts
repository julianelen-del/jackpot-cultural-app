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
    .replace(/\s*\(\d{1,2}\)(?=[.,;:\s]|$)/g, "")
    .replace(/\s*\[\d{1,2}\](?=[.,;:\s]|$)/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 30 ? cut.slice(0, lastSpace) : cut}…`;
}

function fitCompleteSentences(text: string, maxLen: number): string {
  const clean = stripEditorialMarkdown(text);
  if (clean.length <= maxLen) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    let acc = "";
    for (const rawSentence of sentences) {
      const s = rawSentence.trim();
      const candidate = acc ? `${acc} ${s}` : s;
      if (candidate.length <= maxLen) {
        acc = candidate;
      } else {
        break;
      }
    }
    if (acc) return acc;
  }
  return truncateText(clean, maxLen);
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
        // Probar siguiente dirección
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
      .resize(924, 410, { fit: "cover", position: "attention" })
      .jpeg({ quality: 86 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderTreeToJpeg(
  tree: unknown,
  fonts: FontAsset[]
): Promise<Buffer> {
  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: 1080,
    height: 1350,
    fonts,
  });

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

function wrapCardFrame(
  edition: CountryEdition,
  slideLabel: string,
  bodyChildren: unknown[]
) {
  return {
    type: "div",
    props: {
      style: {
        width: "1080px",
        height: "1350px",
        boxSizing: "border-box",
        backgroundColor: "#F5F2EB",
        color: "#161615",
        display: "flex",
        flexDirection: "column",
        padding: "36px",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              width: "1008px",
              height: "1278px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              border: "2px solid #161615",
              backgroundColor: "#FAF8F3",
              padding: "36px 42px",
            },
            children: [
              // Cabecera superior común
              {
                type: "div",
                props: {
                  style: {
                    width: "924px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #D6D0C4",
                    paddingBottom: "16px",
                    fontSize: "23px",
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
                        children: `${edition.edition_week} · ${slideLabel}`,
                      },
                    },
                  ],
                },
              },

              // Cuerpo central
              {
                type: "div",
                props: {
                  style: {
                    width: "924px",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    overflow: "hidden",
                  },
                  children: bodyChildren,
                },
              },

              // Pie común
              {
                type: "div",
                props: {
                  style: {
                    width: "924px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid #D6D0C4",
                    paddingTop: "16px",
                    fontSize: "21px",
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
                        children: edition.country.toUpperCase(),
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
}

async function renderSlide1(
  edition: CountryEdition,
  coverUri: string | null,
  fonts: FontAsset[]
): Promise<Buffer> {
  const cleanIntro = fitCompleteSentences(edition.intro, 240);

  const body = [
    {
      type: "div",
      props: {
        style: {
          width: "924px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        },
        children: [
          {
            type: "span",
            props: {
              style: {
                fontSize: "24px",
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
                fontSize: edition.country.length > 12 ? "74px" : "92px",
                fontWeight: 500,
                lineHeight: 1.04,
                letterSpacing: "-1px",
                maxWidth: "900px",
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
                fontSize: "35px",
                lineHeight: 1.35,
                color: "#2D2C29",
                maxWidth: "890px",
              },
              children: cleanIntro,
            },
          },
        ],
      },
    },
    ...(coverUri
      ? [
          {
            type: "div",
            props: {
              style: {
                width: "924px",
                height: "410px",
                display: "flex",
                marginTop: "30px",
                border: "1px solid #161615",
                backgroundColor: "#EFEAE0",
                overflow: "hidden",
              },
              children: [
                {
                  type: "img",
                  props: {
                    src: coverUri,
                    style: {
                      width: "924px",
                      height: "410px",
                      objectFit: "cover",
                    },
                  },
                },
              ],
            },
          },
        ]
      : []),
    {
      type: "div",
      props: {
        style: {
          width: "924px",
          display: "flex",
          justifyContent: "center",
          marginTop: "26px",
        },
        children: [
          {
            type: "span",
            props: {
              style: {
                fontSize: "23px",
                letterSpacing: "4px",
                color: "#5C5952",
                fontWeight: 600,
              },
              children: "DESLIZÁ PARA LEER EL PANORAMA →",
            },
          },
        ],
      },
    },
  ];

  return renderTreeToJpeg(wrapCardFrame(edition, "01/03", body), fonts);
}

async function renderSlide2(
  edition: CountryEdition,
  fonts: FontAsset[]
): Promise<Buffer> {
  const topics = edition.topics.slice(0, 3);
  const summaryLimit = topics.length <= 2 ? 460 : 340;

  const body = [
    {
      type: "div",
      props: {
        style: {
          width: "924px",
          display: "flex",
          flexDirection: "column",
        },
        children: [
          {
            type: "span",
            props: {
              style: {
                fontSize: "21px",
                letterSpacing: "4px",
                color: "#B83827",
                fontWeight: 600,
              },
              children: "TEMAS DESTACADOS",
            },
          },
          {
            type: "span",
            props: {
              style: {
                width: "924px",
                marginTop: "6px",
                fontFamily: "Newsreader",
                fontSize: "44px",
                fontWeight: 500,
                color: "#161615",
                borderBottom: "2px solid #161615",
                paddingBottom: "12px",
              },
              children: `Qué mueve a ${edition.country} esta semana`,
            },
          },
        ],
      },
    },
    {
      type: "div",
      props: {
        style: {
          width: "924px",
          display: "flex",
          flexDirection: "column",
          marginTop: "22px",
          gap: topics.length <= 2 ? "34px" : "20px",
        },
        children: topics.map((t) => ({
          type: "div",
          props: {
            style: {
              width: "924px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              borderLeft: "5px solid #B83827",
              paddingLeft: "22px",
            },
            children: [
              {
                type: "span",
                props: {
                  style: {
                    width: "894px",
                    fontSize: "20px",
                    letterSpacing: "3px",
                    color: "#B83827",
                    fontWeight: 600,
                  },
                  children: t.category.toUpperCase(),
                },
              },
              {
                type: "span",
                props: {
                  style: {
                    width: "894px",
                    marginTop: "4px",
                    fontFamily: "Newsreader",
                    fontSize: "35px",
                    fontWeight: 500,
                    lineHeight: 1.15,
                    color: "#161615",
                  },
                  children: truncateText(stripEditorialMarkdown(t.title), 120),
                },
              },
              {
                type: "span",
                props: {
                  style: {
                    width: "894px",
                    marginTop: "6px",
                    fontSize: "24px",
                    lineHeight: 1.34,
                    color: "#383530",
                  },
                  children: fitCompleteSentences(t.summary, summaryLimit),
                },
              },
            ],
          },
        })),
      },
    },
  ];

  return renderTreeToJpeg(wrapCardFrame(edition, "02/03", body), fonts);
}

async function renderSlide3(
  edition: CountryEdition,
  cfg: CountrySourceConfig,
  fonts: FontAsset[]
): Promise<Buffer> {
  const listeningNames = [
    cfg.listening?.radio?.name,
    cfg.listening?.radio_alt?.name,
    cfg.listening?.podcast?.name,
    cfg.listening?.playlist?.name,
  ].filter((x): x is string => Boolean(x));

  const body = [
    // Caja Para descubrir
    {
      type: "div",
      props: {
        style: {
          width: "924px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          border: "2px solid #161615",
          backgroundColor: "#EFEAE0",
          padding: "36px 40px",
        },
        children: