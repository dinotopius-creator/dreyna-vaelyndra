import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={
        align === "center"
          ? "mx-auto max-w-3xl text-center"
          : "max-w-3xl text-left"
      }
    >
      {eyebrow && (
        <p className="font-regal text-[10px] tracking-[0.26em] text-gold-300 sm:text-[11px] sm:tracking-[0.4em]">
          {eyebrow}
        </p>
      )}
      <h2 className="heading-gold mt-3 text-2xl text-balance sm:text-3xl md:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-sm leading-6 text-ivory/75 sm:mt-4 sm:text-base md:text-lg">
          {subtitle}
        </p>
      )}
      {children}
    </motion.div>
  );
}
