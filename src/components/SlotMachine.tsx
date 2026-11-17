"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
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
const SOUND_PREF_KEY = "jackpot_cultural_sound_enabled";

function playMechanicalTick(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.032);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch {
    // Ignorar si el navegador restringe audio
  }
}

function playRevealChime(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.06;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.9);
    });
  } catch {
    // Ignorar si el navegador restringe audio
  }
}

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
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [displayContinent, setDisplayContinent] = useState("AZAR");
  const [displayFlag, setDisplayFlag] = useState("🌐");
  const [displayCountry, setDisplayCountry] = useState("DESCUBRIR");
  const [lockedCount, setLockedCount] = useState<0 | 1 | 2 | 3>(0);
  const [winner, setWinner] = useState<CountrySummary | null>(null);

  const timersRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasAutoSpunRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_PREF_KEY);
      if (saved === "0") setSoundEnabled(false);
    } catch {
      // Ignorar
    }
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      } catch {
        // Ignorar
      }
      return next;
    });
  };

  const getAudioContext = useCallback((): AudioContext | null => {
    if (!soundEnabled || typeof window === "undefined") return null;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, [soundEnabled]);

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

    const audioCtx = getAudioContext();

    clearAllTimers();
    setIsSpinning(true);
    setLeverPulled(true);
    setWinner(null);
    setLockedCount(0);

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
      // Ignorar
    }

    router.prefetch(`/pais/${chosen.slug}`);

    const leverTimer = window.setTimeout(() => setLeverPulled(false), 450);
    timersRef.current.push(leverTimer);

    if (prefersReducedMotion) {
      setDisplayContinent(chosen.continent.toUpperCase());
      setDisplayFlag(chosen.flag);
      setDisplayCountry(chosen.country.toUpperCase());
      setLockedCount(3);
      setWinner(chosen);
      if (audioCtx) playRevealChime(audioCtx);
      const navTimer = window.setTimeout(() => {
        router.push(`/pais/${chosen.slug}`);
      }, 1200);
      timersRef.current.push(navTimer);
      return;
    }

    let step = 0;
    const intervalId = window.setInterval(() => {
      step++;
      if (audioCtx && step % 2 === 1) {
        playMechanicalTick(audioCtx);
      }
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

    const t1 = window.setTimeout(() => {
      setDisplayContinent(chosen.continent.toUpperCase());
      setLockedCount(1);
      if (audioCtx) playMechanicalTick(audioCtx);
    }, 850);

    const t2 = window.setTimeout(() => {
      setDisplayFlag(chosen.flag);
      setLockedCount(2);
      if (audioCtx) playMechanicalTick(audioCtx);
    }, 1380);

    const t3 = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setDisplayCountry(chosen.country.toUpperCase());
      setLockedCount(3);
      setWinner(chosen);
      if (audioCtx) playRevealChime(audioCtx);
    }, 1980);

    // Pausa generosa de ~1.9 segundos para saborear el país ganador
    const tNav = window.setTimeout(() => {
      router.push(`/pais/${chosen.slug}`);
    }, 3850);

    timersRef.current.push(t1, t2, t3, tNav);
  }, [
    clearAllTimers,
    continentsList,
    countries,
    getAudioContext,
    isSpinning,
    prefersReducedMotion,
    router,
  ]);

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

      <section
        aria-label="Selector aleatorio de país"
        className="flex w-full max-w-3xl flex-col items-center gap-7 md:flex-row md:justify-center md:gap-0"
      >
        <div className="w-full max-w-xl border border-ink/85 bg-paper-warm p-3 shadow-[0_14px_38px_-18px_rgba(22,22,21,0.22)] sm:p-5">
          <div className="border border-ink/25 bg-paper p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-hairline pb-2 text-[10px] font-medium tracking-[0.18em] text-ink-muted uppercase">
              <span>Destino editorial</span>
              <span>{countries.length} países</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_0.65fr_1.35fr] sm:gap-3">
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

            <div className="mt-3 flex min-h-6 items-center justify-center text-center">
              {winner ? (
                <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
                  Destino seleccionado: {winner.flag} {winner.country}
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

        <div className="hidden md:flex md:flex-col md:items-center">
          <div className="flex items-center">
            <div className="h-5 w-4 border-y border-ink/85 bg-paper-warm" />

            <div className="relative flex h-40 w-12 items-start justify-center border border-ink/85 bg-paper-warm pt-3 shadow-[0_12px_28px_-14px_rgba(22,22,21,0.28)]">
              <div className="h-32 w-2 rounded-full border border-ink/25 bg-ink/15 shadow-inner" />

              <motion.button
                type="button"
                onClick={pullLever}
                disabled={isSpinning}
                aria-label="Accionar palanca"
                drag="y"
                dragConstraints={{ top: 0, bottom: 92 }}
                dragElastic={0.1}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 28) {
                    pullLever();
                  }
                }}
                animate={{
                  y: leverPulled ? 92 : 0,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                className="absolute top-2.5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-accent shadow-[0_4px_10px_rgba(22,22,21,0.28)] transition-colors hover:bg-[#9E2E20] focus:outline-none disabled:cursor-wait"
              >
                <span className="pointer-events-none absolute top-1.5 left-2 h-2 w-2 rounded-full bg-white/35" />
                <span className="pointer-events-none h-2.5 w-2.5 rounded-full border border-ink/35 bg-black/15" />
              </motion.button>
            </div>
          </div>

          <span className="mt-2.5 pl-4 text-[10px] font-medium tracking-[0.18em] text-ink-muted uppercase">
            Tirar ↓
          </span>
        </div>

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

      <div className="mt-10 flex items-center gap-6 sm:mt-12">
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          disabled={isSpinning}
          className="cursor-pointer border-b border-ink/40 pb-0.5 text-xs font-medium tracking-[0.16em] text-ink-muted uppercase transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          Elegir país
        </button>

        <button
          type="button"
          onClick={toggleSound}
          aria-label={soundEnabled ? "Silenciar sonido" : "Activar sonido"}
          title={soundEnabled ? "Sonido activado" : "Sonido silenciado"}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] tracking-[0.12em] text-ink-muted uppercase transition-colors hover:text-ink"
        >
          {soundEnabled ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {soundEnabled ? "Sonido" : "Sin sonido"}
          </span>
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