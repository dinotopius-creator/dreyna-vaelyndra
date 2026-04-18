import { AnimatePresence, motion } from "framer-motion";
import type { Gift } from "../types";

export interface GiftFlightItem {
  id: string;
  gift: Gift;
  x: number;
}

interface Props {
  items: GiftFlightItem[];
}

/**
 * Affiche les cadeaux qui s'envolent au-dessus de la scène live
 * (animation purement visuelle, consommée via `GiftFlight` sur la page Live).
 */
export function GiftFlight({ items }: Props) {
  return (
    <AnimatePresence>
      {items.map((item) => (
        <motion.img
          key={item.id}
          src={item.gift.icon}
          alt=""
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: 1, y: -260, scale: 1.15 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.6, ease: "easeOut" }}
          style={{ left: `${item.x}%` }}
          className="pointer-events-none absolute bottom-8 h-14 w-14 rounded-full ring-2 ring-gold-400/50"
        />
      ))}
    </AnimatePresence>
  );
}
