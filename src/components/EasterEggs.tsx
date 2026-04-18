import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useToast } from "../contexts/ToastContext";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/** Easter eggs elfiques : Konami code + console salute. */
export function EasterEggs() {
  const [showScroll, setShowScroll] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    // Konami
    let buffer: string[] = [];
    function onKey(e: KeyboardEvent) {
      buffer.push(e.key);
      buffer = buffer.slice(-KONAMI.length);
      if (
        buffer.length === KONAMI.length &&
        buffer.every((k, i) => k.toLowerCase() === KONAMI[i].toLowerCase())
      ) {
        setShowScroll(true);
        notify("✨ Vous avez prononcé le serment des étoiles.", "info");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notify]);

  useEffect(() => {
    const css1 =
      "color:#fbeecb; background:#2a0f4f; padding:8px 14px; border-radius:10px; font-family:'Cinzel', serif; font-size:14px; letter-spacing:0.2em; text-transform:uppercase;";
    const css2 = "color:#e6c274; font-size:12px;";
    console.log("%c✦ VAELYNDRA ✦ Bienvenue dans la console royale.", css1);
    console.log(
      "%cIndice : prononcez le serment stellaire (↑ ↑ ↓ ↓ ← → ← → B A).",
      css2,
    );
  }, []);

  return (
    <AnimatePresence>
      {showScroll && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-night-900/80 backdrop-blur"
          onClick={() => setShowScroll(false)}
        >
          <motion.div
            initial={{ scale: 0.8, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            className="card-royal max-w-lg p-10 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Sparkles className="mx-auto h-10 w-10 text-gold-300" />
            <h3 className="heading-gold mt-4 text-3xl">Serment d'Elennor</h3>
            <p className="mt-4 font-serif text-lg italic text-ivory/80">
              « Par la lumière des étoiles, par la couronne d'aube,<br />
              je jure fidélité à la reine Dreyna,<br />
              gardienne de Vaelyndra. »
            </p>
            <p className="mt-6 text-xs text-ivory/50">
              Votre nom est désormais inscrit dans les archives secrètes.
            </p>
            <button
              onClick={() => setShowScroll(false)}
              className="btn-gold mt-6"
            >
              Sceller le serment
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
