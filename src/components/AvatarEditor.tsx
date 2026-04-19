/**
 * Atelier d'avatar 2D « paper-doll » basé sur DiceBear.
 *
 * L'utilisateur choisit un style d'illustration (aventurier, lorelei,
 * persona…), ajuste un seed (graine qui détermine coiffure / trait /
 * tenue) et une couleur de fond. L'aperçu se met à jour en direct via
 * l'API publique DiceBear (SVG servi sur leur CDN, pas de build lourd).
 *
 * On passe ensuite l'URL DiceBear complète à `onExport` pour que la
 * page parente la persiste en base — c'est cette même URL qui sera
 * rendue partout (navbar, profil, posts, lives) via un simple `<img>`.
 *
 * Remplace l'ancien iframe Ready Player Me (service fermé par Netflix
 * le 31 janvier 2026) : plus de dépendance externe fragile, tout le
 * catalogue est généré à la volée à partir du seed.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Dice5, Shuffle, Wand2 } from "lucide-react";
import clsx from "clsx";
import {
  BACKGROUND_SWATCHES,
  DEFAULT_CONFIG,
  STYLES,
  buildDicebearUrl,
  parseDicebearUrl,
  randomSeed,
  type DicebearConfig,
} from "../lib/dicebear";

interface Props {
  /** Avatar déjà sauvegardé — sert à pré-remplir le style/seed à l'ouverture. */
  initialAvatarUrl?: string | null;
  /** Seed par défaut (typiquement le pseudo de l'utilisateur). */
  defaultSeed: string;
  /** Appelée à chaque clic sur « Appliquer » avec l'URL finale de l'avatar. */
  onExport: (input: { avatarUrl: string; avatarImageUrl: string }) => void;
  onClose?: () => void;
  className?: string;
}

export function AvatarEditor({
  initialAvatarUrl,
  defaultSeed,
  onExport,
  onClose,
  className,
}: Props) {
  const [config, setConfig] = useState<DicebearConfig>(() => {
    // Reprend la config existante pour que l'utilisateur retrouve son avatar
    // au lieu de repartir d'une page blanche à chaque ouverture.
    const parsed = parseDicebearUrl(initialAvatarUrl);
    if (parsed) return parsed;
    return { ...DEFAULT_CONFIG, seed: defaultSeed };
  });

  const previewUrl = useMemo(() => buildDicebearUrl(config), [config]);

  function applyExport() {
    const url = buildDicebearUrl(config);
    // L'URL DiceBear sert à la fois pour le grand rendu et pour la vignette :
    // c'est déjà du SVG léger, pas besoin de générer un second asset.
    onExport({ avatarUrl: url, avatarImageUrl: url });
  }

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-3xl border border-gold-400/30 bg-night-900/80 p-6 shadow-glow-gold md:p-8",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-regal text-[10px] tracking-[0.22em] text-gold-300">
            ✦ Atelier de Vaelyndra
          </p>
          <h3 className="mt-1 font-display text-2xl text-gold-200">
            Sculptez votre double
          </h3>
          <p className="mt-1 text-sm text-ivory/60">
            Chaque seed tire une coiffure, un trait, une tenue et des
            accessoires uniques. Explorez jusqu'à trouver la bonne.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-royal-500/30 px-3 py-1.5 font-regal text-[10px] tracking-[0.22em] text-ivory/70 hover:text-rose-300"
          >
            Fermer ✕
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
        <motion.div
          layout
          key={previewUrl}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-3"
        >
          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-gold-400/40 bg-night-950">
            <img
              src={previewUrl}
              alt="Aperçu de l'avatar"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              setConfig((c) => ({ ...c, seed: randomSeed() }))
            }
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gold-400/40 bg-gold-500/10 px-4 py-2 font-regal text-[10px] tracking-[0.22em] text-gold-200 transition hover:bg-gold-500/20"
          >
            <Dice5 className="h-4 w-4" /> Retirer les dés
          </button>
        </motion.div>

        <div className="space-y-5">
          <section>
            <p className="mb-2 font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Style d'illustration
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STYLES.map((s) => {
                const active = s.id === config.style;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({ ...c, style: s.id }))
                    }
                    className={clsx(
                      "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                      active
                        ? "border-gold-400/70 bg-gold-500/15 text-gold-100"
                        : "border-royal-500/30 bg-night-900/60 text-ivory/75 hover:border-gold-400/40",
                    )}
                  >
                    <img
                      src={buildDicebearUrl({
                        style: s.id,
                        seed: s.previewSeed,
                        backgroundColor: config.backgroundColor,
                      })}
                      alt=""
                      className="h-10 w-10 rounded-md border border-gold-400/20 object-cover"
                      draggable={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{s.label}</p>
                      <p className="truncate text-[11px] text-ivory/55">
                        {s.tagline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="mb-2 font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Graine (seed)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.seed}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, seed: e.target.value }))
                }
                placeholder="Entrez un mot-clef…"
                className="flex-1 rounded-full border border-royal-500/30 bg-night-950 px-4 py-2 text-sm text-ivory/85 placeholder:text-ivory/30 focus:border-gold-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({ ...c, seed: randomSeed() }))
                }
                className="inline-flex items-center gap-2 rounded-full border border-royal-500/30 px-4 py-2 font-regal text-[10px] tracking-[0.22em] text-ivory/75 hover:border-gold-400/60 hover:text-gold-200"
              >
                <Shuffle className="h-3.5 w-3.5" /> Hasard
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ivory/45">
              Le même seed redonne toujours le même avatar — pratique pour
              retrouver celui d'un·e ami·e.
            </p>
          </section>

          <section>
            <p className="mb-2 font-regal text-[10px] tracking-[0.22em] text-gold-300">
              ✦ Couleur de fond
            </p>
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_SWATCHES.map((sw) => {
                const active = sw.hex === config.backgroundColor;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() =>
                      setConfig((c) => ({ ...c, backgroundColor: sw.hex }))
                    }
                    title={sw.label}
                    className={clsx(
                      "relative h-9 w-9 rounded-full border transition",
                      active
                        ? "border-gold-200 ring-2 ring-gold-400/60"
                        : "border-royal-500/40 hover:border-gold-300/60",
                    )}
                    style={{ backgroundColor: `#${sw.hex}` }}
                  >
                    <span className="sr-only">{sw.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <button
            type="button"
            onClick={applyExport}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-shine px-5 py-3 font-regal text-[11px] tracking-[0.22em] text-night-900 transition hover:brightness-110"
          >
            <Wand2 className="h-4 w-4" /> Appliquer ce brouillon
          </button>
          <p className="text-center text-[11px] text-ivory/45">
            L'avatar n'est pas encore scellé — retournez à l'aperçu pour
            cliquer sur « Enregistrer mon avatar ».
          </p>
        </div>
      </div>
    </div>
  );
}
