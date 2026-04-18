import { motion } from "framer-motion";
import { Crown, Gem, PlayCircle, Sparkles } from "lucide-react";
import { BADGES, DREYNA_PROFILE, ZEPETO_LIVE_STATS } from "../data/mock";
import { SectionHeading } from "../components/SectionHeading";
import { RuneDivider } from "../components/RuneDivider";
import { formatNumber, formatRelative } from "../lib/helpers";

export function DreynaProfile() {
  return (
    <div>
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr,1.1fr]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="relative mx-auto max-w-sm"
          >
            <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-gold-400/40 via-royal-500/30 to-celeste-500/30 blur-3xl" />
            <div className="glow-ring relative overflow-hidden rounded-full">
              <img
                src={DREYNA_PROFILE.avatar}
                alt="Dreyna"
                className="h-full w-full object-cover"
              />
            </div>
          </motion.div>
          <div>
            <span className="tag-gold">
              <Crown className="h-3 w-3" /> Profil royal
            </span>
            <h1 className="heading-gold mt-4 text-5xl md:text-7xl">
              Dreyna
            </h1>
            <p className="mt-2 font-serif text-lg italic text-ivory/75">
              "Par la lumière d'Elennor, que le royaume s'éveille."
            </p>
            <p className="mt-6 max-w-xl text-ivory/80">
              {DREYNA_PROFILE.bio}
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {DREYNA_PROFILE.titles.map((t) => (
                <li key={t} className="tag-gold">
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={DREYNA_PROFILE.socials.zepeto}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-royal"
              >
                <Gem className="h-4 w-4" />
                ZEPETO · {DREYNA_PROFILE.socials.zepetoHandle}
              </a>
              <a
                href={DREYNA_PROFILE.socials.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <PlayCircle className="h-4 w-4" />
                YouTube · {DREYNA_PROFILE.socials.youtubeHandle}
              </a>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ["Abonnés", formatNumber(DREYNA_PROFILE.stats.followers), true],
                  ["Cœurs", formatNumber(DREYNA_PROFILE.stats.likes), false],
                  ["Articles", DREYNA_PROFILE.stats.articles, true],
                  ["Lives", DREYNA_PROFILE.stats.lives, false],
                ] as [string, string | number, boolean][]
              ).map(([label, value, live]) => (
                <div key={label} className="card-royal p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <p className="font-display text-2xl text-gold-200">
                      {value}
                    </p>
                    {live && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                    )}
                  </div>
                  <p className="font-regal text-[10px] tracking-[0.22em] text-ivory/55">
                    {label}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-regal text-[10px] tracking-[0.22em] text-ivory/45">
              Stats ZEPETO · @{ZEPETO_LIVE_STATS.handle} · synchronisé{" "}
              {formatRelative(ZEPETO_LIVE_STATS.fetchedAt)}
            </p>
          </div>
        </div>
      </section>

      <RuneDivider label="✦ Lore officiel ✦" />

      <section className="mx-auto max-w-5xl px-6 py-10">
        <SectionHeading
          eyebrow="Le Lore"
          title={<>L'histoire du <span className="text-mystic">royaume</span></>}
          subtitle="Vaelyndra est née d'un rêve tissé par trois lunes. Voici ses premières pages."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "I. L'Aube d'Elennor",
              body:
                "Quand les étoiles tissent la première brume, Dreyna reçoit la Couronne d'Aube.",
            },
            {
              title: "II. Le Pacte de Sylvaris",
              body:
                "Les Arbres-Monde confient leur chant. La reine jure fidélité aux racines.",
            },
            {
              title: "III. La Cour Royale",
              body:
                "Chevaliers lunaires, archers d'argent, bardes stellaires — la cour prend forme.",
            },
          ].map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="card-royal p-6"
            >
              <Sparkles className="h-5 w-5 text-gold-300" />
              <h3 className="mt-3 font-display text-lg text-gold-200">
                {c.title}
              </h3>
              <p className="mt-2 font-serif text-sm italic text-ivory/75">
                {c.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          eyebrow="Galerie royale"
          title="Portraits & instants d'une reine"
          subtitle="Photographies officielles de la cour de Vaelyndra."
        />
        <div className="mt-10 columns-2 gap-4 md:columns-3">
          {DREYNA_PROFILE.gallery.map((url, i) => (
            <motion.img
              key={url}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              src={url}
              alt={`Dreyna ${i + 1}`}
              className="mb-4 w-full rounded-2xl object-cover ring-1 ring-royal-500/30"
            />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <SectionHeading
          eyebrow="Badges & distinctions"
          title={<>Insignes de la <span className="text-mystic">couronne</span></>}
          subtitle="Artefacts rares portés par Dreyna, offerts à la cour lors des rituels."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="card-royal flex items-center gap-4 p-5"
            >
              <div className="text-3xl">{b.icon}</div>
              <div className="flex-1">
                <h4 className="font-display text-base text-gold-200">
                  {b.name}
                </h4>
                <p className="text-xs text-ivory/60">{b.description}</p>
              </div>
              <span
                className={`font-regal text-[10px] tracking-[0.22em] ${
                  b.rarity === "royale"
                    ? "text-gold-300"
                    : b.rarity === "mythique"
                      ? "text-royal-300"
                      : b.rarity === "rare"
                        ? "text-celeste-500"
                        : "text-ivory/50"
                }`}
              >
                {b.rarity}
              </span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
