import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad — JACKPOT CULTURAL",
  description:
    "Información sobre privacidad, datos y publicaciones automatizadas de JACKPOT CULTURAL.",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-dvh bg-paper pb-24">
      <nav className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-8">
          <Link
            href="/"
            className="font-serif text-lg font-semibold tracking-tight text-ink transition-colors hover:text-accent sm:text-xl"
          >
            JACKPOT CULTURAL
          </Link>
          <Link
            href="/"
            className="border-b border-ink/30 pb-0.5 text-[11px] font-medium tracking-[0.14em] text-ink-muted uppercase transition-colors hover:border-ink hover:text-ink"
          >
            Volver a la portada
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 pt-12 sm:px-8 sm:pt-16">
        <p className="text-[11px] font-medium tracking-[0.2em] text-accent uppercase">
          Información legal
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">
          Política de Privacidad
        </h1>
        <p className="mt-2 text-xs text-ink-muted">
          Última actualización: noviembre de 2026
        </p>

        <div className="mt-8 space-y-6 border-t border-hairline pt-8 font-serif text-lg leading-relaxed text-ink/90">
          <p>
            <strong>JACKPOT CULTURAL</strong> es una publicación digital semanal
            dedicada a la difusión de música, cine, series, libros y debates
            culturales de 27 países.
          </p>
          <p>
            El sitio web es puramente informativo y estático: no requiere
            registro de usuarios, no solicita datos personales ni almacena
            información de cuentas de terceros. En el navegador únicamente se
            guarda de forma local la preferencia de sonido de la portada y el
            último país visitado durante la sesión.
          </p>
          <p>
            Las integraciones con plataformas externas (como Meta / Facebook /
            Instagram) se utilizan exclusivamente para publicar de manera
            automatizada resúmenes editoriales y placas visuales de los
            contenidos propios de <strong>JACKPOT CULTURAL</strong> en sus
            cuentas oficiales, sin recopilar, almacenar ni procesar datos de
            otros usuarios.
          </p>
          <p>
            Para consultas relacionadas con esta política o con los contenidos
            publicados, podés contactarnos a través de nuestras redes oficiales o
            el repositorio del proyecto.
          </p>
        </div>
      </main>
    </div>
  );
}