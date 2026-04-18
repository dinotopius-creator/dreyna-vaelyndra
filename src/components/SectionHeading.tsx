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
        <p className="font-regal text-[11px] tracking-[0.4em] text-gold-300">
          {eyebrow}
        </p>
      )}
      <h2 className="heading-gold mt-3 text-3xl text-balance md:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base text-ivory/75 md:text-lg">{subtitle}</p>
      )}
      {children}
    </motion.div>
  );
}
