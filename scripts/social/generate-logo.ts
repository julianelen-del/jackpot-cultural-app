import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";

const OUT_PATH = path.join(process.cwd(), "public", "logo.png");

interface FontAsset {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

async function fetchBuffer(url: string, timeoutMs = 12000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
    return Buffer.from(await res.arrayBuffer());
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
      weight: 600,
      style: "normal",
      urls: [
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5.1.0/files/newsreader-latin-600-normal.woff",
        "https://cdn.jsdelivr.net/npm/@fontsource/newsreader/files/newsreader-latin-600-normal.woff",
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
        const buf = await fetchBuffer(url);
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
    throw new Error("No se pudieron descargar las fuentes para el logo.");
  }
  return loaded;
}

async function main() {
  const fonts = await loadFonts();

  const tree = {
    type: "div",
    props: {
      style: {
        width: "1024px",
        height: "1024px",
        backgroundColor: "#F5F2EB",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              width: "830px",
              height: "830px",
              borderRadius: "415px",
              backgroundColor: "#FAF8F3",
              border: "14px solid #161615",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            },
            children: [
              {
                type: "span",
                props: {
                  style: {
                    fontSize: "28px",
                    fontWeight: 600,
                    letterSpacing: "10px",
                    color: "#5C5952",
                    marginBottom: "28px",
                  },
                  children: "JACKPOT",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                  },
                  children: [
                    // Caja principal con 3 ventanillas
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          gap: "14px",
                          padding: "24px",
                          backgroundColor: "#EFEAE0",
                          border: "10px solid #161615",
                        },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "118px",
                                height: "210px",
                                backgroundColor: "#F5F2EB",
                                border: "5px solid #161615",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "Newsreader",
                                fontSize: "128px",
                                fontWeight: 600,
                                color: "#161615",
                              },
                              children: "J",
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "118px",
                                height: "210px",
                                backgroundColor: "#F5F2EB",
                                border: "5px solid #161615",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "Newsreader",
                                fontSize: "128px",
                                fontWeight: 600,
                                color: "#B83827",
                              },
                              children: "C",
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "118px",
                                height: "210px",
                                backgroundColor: "#F5F2EB",
                                border: "5px solid #161615",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                              children: [
                                {
                                  type: "svg",
                                  props: {
                                    width: "72",
                                    height: "72",
                                    viewBox: "0 0 80 80",
                                    fill: "none",
                                    children: [
                                      {
                                        type: "circle",
                                        props: {
                                          cx: "40",
                                          cy: "40",
                                          r: "30",
                                          stroke: "#161615",
                                          strokeWidth: "4.5",
                                        },
                                      },
                                      {
                                        type: "ellipse",
                                        props: {
                                          cx: "40",
                                          cy: "40",
                                          rx: "14",
                                          ry: "30",
                                          stroke: "#161615",
                                          strokeWidth: "4.5",
                                        },
                                      },
                                      {
                                        type: "line",
                                        props: {
                                          x1: "10",
                                          y1: "40",
                                          x2: "70",
                                          y2: "40",
                                          stroke: "#161615",
                                          strokeWidth: "4.5",
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
                    },
                    // Brazo lateral y palanca integrada
                    {
                      type: "div",
                      props: {
                        style: {
                          width: "18px",
                          height: "32px",
                          backgroundColor: "#EFEAE0",
                          borderTop: "7px solid #161615",
                          borderBottom: "7px solid #161615",
                        },
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          width: "44px",
                          height: "152px",
                          backgroundColor: "#EFEAE0",
                          border: "7px solid #161615",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          paddingTop: "14px",
                          position: "relative",
                        },
                        children: [
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "10px",
                                height: "110px",
                                borderRadius: "5px",
                                backgroundColor: "#C8C2B6",
                              },
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: {
                                position: "absolute",
                                top: "12px",
                                width: "44px",
                                height: "44px",
                                borderRadius: "22px",
                                backgroundColor: "#B83827",
                                border: "7px solid #161615",
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                type: "span",
                props: {
                  style: {
                    fontSize: "28px",
                    fontWeight: 600,
                    letterSpacing: "10px",
                    color: "#B83827",
                    marginTop: "28px",
                  },
                  children: "CULTURAL",
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1024,
    height: 1024,
    fonts,
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(OUT_PATH);
  console.log("✓ Logo generado en public/logo.png (1024x1024)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});