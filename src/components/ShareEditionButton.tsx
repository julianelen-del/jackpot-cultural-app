"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

interface ShareEditionButtonProps {
  country: string;
  slug: string;
  editionWeek: string;
}

export function ShareEditionButton({
  country,
  slug,
  editionWeek,
}: ShareEditionButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/pais/${slug}`;
    const title = `${country} (${editionWeek}) — JACKPOT CULTURAL`;
    const text = `Mirá el panorama cultural de ${country} esta semana en Jackpot Cultural.`;

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Si se cancela o falla, copiar al portapapeles
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignorar si el navegador restringe el portapapeles
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex cursor-pointer items-center gap-2 border border-ink/30 px-6 py-3 text-xs font-medium tracking-[0.16em] text-ink uppercase transition-colors hover:border-ink"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-accent" />
          <span>Enlace copiado</span>
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          <span>Compartir edición</span>
        </>
      )}
    </button>
  );
}