import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

type ToastKind = "success" | "info" | "error";

interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  notify: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex flex-col items-center gap-3 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-gold-400/30 bg-night-800/85 px-5 py-3 text-sm text-ivory shadow-glow backdrop-blur-xl"
            >
              {t.kind === "success" && (
                <CheckCircle2 className="h-4 w-4 text-gold-300" />
              )}
              {t.kind === "info" && (
                <Sparkles className="h-4 w-4 text-royal-300" />
              )}
              {t.kind === "error" && (
                <AlertCircle className="h-4 w-4 text-rose-300" />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used in ToastProvider");
  return ctx;
}
