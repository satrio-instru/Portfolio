import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import { useToast } from "../context/ToastContext";

const icons = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
};

const toneClass = {
  success: "toast-success",
  error: "toast-error",
  info: "toast-info",
};

export default function Toast() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info;
          return (
            <motion.div
              key={toast.id}
              className={`toast-item ${toneClass[toast.type] || "toast-info"}`}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.25 }}
            >
              <Icon size={18} />
              <span>{toast.message}</span>
              <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Tutup">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
