"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { Continent } from "@/lib/schema";
import type { CountrySummary } from "@/lib/countries";
import { CountrySelectorModal } from "./CountrySelectorModal";

interface SlotMachineProps {
  countries: CountrySummary[];
  groupedCountries: {
    continent: Continent;
    countries: CountrySummary[];
  }[];
}

const LAST_COUNTRY_KEY = "jackpot_cultural_last_slug";

export function SlotMachine({
  countries,
  groupedCountries,
}: SlotMachineProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  const [isSpinning, setIsSpinning] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [leverPulled, setLeverPulled] = useState(false);

  // Rodillos visibles
  const [displayContinent, setDisplayContinent] = useState("AZAR");
  const [displayFlag, setDisplayFlag] = useState("🌐");
  const [displayCountry, setDisplayCountry] = useState("DESCUBRIR");
  const [lockedCount, setLockedCount] = useState<0 | 1 | 2 | 3>(0);
  const [winner, setWinner] = useState<CountrySummary | null>(null);

  const timersRef = useRef<number[]>([]);
  const hasAutoSpunRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const continentsList = useMemo(
    () => Array.from(new Set(countries.map((c) => c.continent))),
    [countries]
  );

  const pullLever = useCallback(() => {
    if (isSpinning || countries.length === 0) return;

    clearAllTimers();
    setIsSpinning(true);
    setLeverPulled(true);
    setWinner(null);
    setLockedCount(0);

    // Evitar repetir exactamente el último país visitado en esta sesión
    let lastSlug: string | null = null;
    try {
      lastSlug = sessionStorage.getItem(LAST_COUNTRY_KEY);
    } catch {
      lastSlug = null;
    }

    const pool =
      countries.length > 1 && lastSlug
        ? countries.filter((c) => c.slug !== lastSlug)
        : countries;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    try {
      sessionStorage.setItem(LAST_COUNTRY_KEY, chosen.slug);
    } catch {
      // Ignorar si el navegador bloquea sessionStorage
    }

    // Prefetch inmediato para transición instantánea al terminar el giro
    router.prefetch(`/pais/${chosen.slug}`);

    const leverTimer = window.setTimeout(() => setLeverPulled(false), 450);
    timersRef.current.push(leverTimer);

    if (prefersReducedMotion) {
      setDisplayContinent(chosen.continent.toUpperCase());
      setDisplayFlag(chosen.flag);
      setDisplayCountry(chosen.country.toUpperCase());
      setLockedCount(3);
      setWinner(chosen);
      const navTimer = window.setTimeout(() => {
        router.push(`/pais/${chosen.slug}`);
      }, 450);
      timersRef.current.push(navTimer);
      return;
    }

    // Ciclos de giro mecánico independiente por rodillo
    let step = 0;
    const intervalId = window.setInterval(() => {
      step++;
      if (step < 11) {
        setDisplayContinent(
          continentsList[step % continentsList.length].toUpperCase()
        );
      }
      if (step < 18) {
        const randomForFlag = countries[(step * 7) % countries.length];
        setDisplayFlag(randomForFlag.flag);
      }
      if (step < 26) {
        const randomForName = countries[(step * 5 + 3) % countries.length];
        setDisplayCountry(randomForName.country.toUpperCase());
      }
    }, 75);
    timersRef.current.push(intervalId);

    // Freno escalonado: Rodillo 1 -> Rodillo 2 -> Rodillo 3
    const t1 = window.setTimeout(() => {
      setDisplayContinent(chosen.continent.toUpperCase());
      setLockedCount(1);
    }, 850);

    const t2 = window.setTimeout(() => {
      setDisplayFlag(chosen.flag);
      setLockedCount(2);
    }, 1380);

    const t3 = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setDisplayCountry(chosen.country.toUpperCase());
      setLockedCount(3);
      setWinner(chosen);
    }, 1980);

    const tNav = window.setTimeout(() => {
      router.push(`/pais/${chosen.slug}`);
    }, 2650);

    timersRef.current.push(t1, t2, t3, tNav);
  }, [
    clearAllTimers,
    continentsList,
    countries,
    isSpinning,
    prefersReducedMotion,
    router,
  ]);

  // Si viene desde "Volver a tirar" (/?spin=1), gira automáticamente
  useEffect(() => {
    if (searchParams.get("spin") === "1" && !hasAutoSpunRef.current) {
      hasAutoSpunRef.current = true;
      const timer = window.setTimeout(() => {
        pullLever();
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [pullLever, searchParams]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6">
      {/* Encabezado mínimo */}
      <header className="mb-10 text-center sm:mb-14">
        <p className="mb-2 text-[10px] font-medium tracking-[0.26em] text-ink-muted uppercase sm:text-[11px]">
          Edición semanal internacional
        </p>
        <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-6xl">
          JACKPOT CULTURAL
        </h1>
        <p className="mt-2.5 font-serif text-base italic text-ink-muted sm:text-lg">
          De qué está hablando la cultura del mundo esta semana.
        </p>
      </header>

      {/* Máquina tragamonedas editorial + Palanca lateral */}
      <section
        aria-label="Selector aleatorio de país"
        className="flex w-full max-w-3xl flex-col items-center gap-7 md:flex-row md:justify-center md:gap-6"
      >
        {/* Caja tipográfica estilo tablero mecánico */}
        <div className="w-full max-w-xl border border-ink/85 bg-paper-warm p-3 shadow-[0_14px_38px_-18px_rgba(22,22,21,0.22)] sm:p-5">
          <div className="border border-ink/25 bg-paper p-3 sm:p-5">
            {/* Línea superior de placa */}
            <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2 text-[10px] font-medium tracking-[0.18em] text-ink-muted uppercase">
              <span>Destino editorial</span>
              <span>{countries.length} países</span>
            </div>

            {/* 3 Rodillos */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_0.65fr_1.35fr] sm:gap-3">
              {/* Rodillo 1: Continente */}
              <div className="flex h-20 flex-col items-center justify-center overflow-hidden border border-ink/20 bg-[#FAF9F5] px-3 sm:h-28">
                <span className="mb-1 text-[9px] font-medium tracking-[0.18em] text-ink-muted uppercase">
                  Región
                </span>
                <motion.span
                  key={displayContinent}
                  initial={prefersReducedMotion ? false : { y: -10, opacity: 0.4 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.14 }}
                  className={`text-center text-xs font-semibold tracking-[0.16em] uppercase sm:text-sm ${
                    lockedCount >= 1 ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {displayContinent}
                </motion.span>
              </div>

              {/* Rodillo 2: Bandera */}
              <div className="flex h-20 flex-col items-center justify-center overflow-hidden border border-ink/20 bg-[#FAF9F5] px-2 sm:h-28">
                <span className="mb-0.5 text-[9px] font-medium tracking-[0.18em] text-ink-muted uppercase">
                  Emblema
                </span>
                <motion.span
                  key={displayFlag}
                  initial={prefersReducedMotion ? false : { scale: 0.85, opacity: 0.4 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.14 }}
                  className="text-4xl leading-none sm:text-5xl"
                  aria-hidden="true"
                >
                  {displayFlag}
                </motion.span>
              </div>

              {/* Rodillo 3: País */}
              <div className="flex h-20 flex-col items-center justify-center overflow-hidden border border-ink/20 bg-[#FAF9F5] px-3 sm:h-28">
                <span className="mb-1 text-[9px] font-medium tracking-[0.18em] text-ink-muted uppercase">
                  País
                </span>
                <motion.span
                  key={displayCountry}
                  initial={prefersReducedMotion ? false : { y: -12, opacity: 0.4 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 26,
                  }}
                  className={`text-center font-serif text-lg font-semibold tracking-wide sm:text-xl ${
                    lockedCount === 3 ? "text-accent" : "text-ink"
                  }`}
                >
                  {displayCountry}
                </motion.span>
              </div>
            </div>

            {/* Estado inferior del visor */}
            <div className="mt-3 flex min-h-6 items-center justify-center text-center">
              {winner ? (
                <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
                  Abriendo edición: {winner.flag} {winner.country}...
                </p>
              ) : isSpinning ? (
                <p className="text-xs tracking-[0.14em] text-ink-muted uppercase">
                  Buscando destino...
                </p>
              ) : (
                <p className="text-xs tracking-[0.12em] text-ink-muted">
                  Accioná la palanca para descubrir un país
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Palanca Desktop (clic o arrastre hacia abajo) */}
        <div className="hidden md:flex md:flex-col md:items-center">
          <div className="relative flex h-44 w-16 items-center justify-center">
            {/* Base fija en el lateral */}
            <div className="h-14 w-3 border border-ink/30 bg-paper-warm" />
            {/* Barra de palanca */}
            <motion.button
              type="button"
              onClick={pullLever}
              disabled={isSpinning}
              aria-label="Accionar palanca"
              drag="y"
              dragConstraints={{ top: 0, bottom: 56 }}
              dragElastic={0.15}
              onDragEnd={(_, info) => {
                if (info.offset.y > 24) {
                  pullLever();
                }
              }}
              animate={{
                y: leverPulled ? 48 : 0,
              }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="absolute top-3 flex cursor-pointer flex-col items-center focus:outline-none disabled:cursor-wait"
            >
              {/* Perilla bermellón */}
              <span className="h-9 w-9 rounded-full border-2 border-ink bg-accent shadow-md transition-colors hover:bg-[#9E2E20]" />
              {/* Vástago metálico */}
              <span className="h-16 w-1.5 bg-ink/80" />
            </motion.button>
          </div>
          <span className="mt-1 text-[10px] font-medium tracking-[0.16em] text-ink-muted uppercase">
            Tirar
          </span>
        </div>

        {/* Botón Palanca Mobile / Tablet */}
        <div className="w-full max-w-xl md:hidden">
          <button
            type="button"
            onClick={pullLever}
            disabled={isSpinning}
            className="w-full cursor-pointer border border-ink bg-accent px-6 py-4 text-xs font-semibold tracking-[0.2em] text-paper uppercase shadow-sm transition-colors hover:bg-[#9E2E20] active:translate-y-0.5 disabled:opacity-60"
          >
            {isSpinning ? "Girando..." : "Accionar palanca"}
          </button>
        </div>
      </section>

      {/* Botón alternativo discreto */}
      <div className="mt-10 sm:mt-12">
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          disabled={isSpinning}
          className="cursor-pointer border-b border-ink/40 pb-0.5 text-xs font-medium tracking-[0.16em] text-ink-muted uppercase transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          Elegir país
        </button>
      </div>

      <CountrySelectorModal
        isOpen={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        groupedCountries={groupedCountries}
      />
    </main>
  );
}