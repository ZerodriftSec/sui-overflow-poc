import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Sparkles, Check, Zap, X } from "lucide-react";
import {  DEMO_PLATFORM_ID  } from "@paystreamer/sdk";

const STORAGE_KEY = "paystreamer:demo-banner-dismissed";
const hasDemo = typeof DEMO_PLATFORM_ID === "string" && DEMO_PLATFORM_ID.length > 0;

interface Step {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
}

const baseSteps: Step[] = [
  {
    icon: <Droplets size={14} className="text-[#6c63ff]" />,
    label: "Get devnet SUI",
    href: "https://faucet.sui.io/?network=devnet",
    external: true,
  },
  {
    icon: <Check size={14} className="text-[#6c63ff]" />,
    label: "Approve subscription",
    href: "#subscribe",
  },
  {
    icon: <Zap size={14} className="text-[#6c63ff]" />,
    label: "Watch it auto-bill every 60s",
    href: "#process-now",
  },
];

const demoStep: Step = {
  icon: <Sparkles size={14} className="text-[#6c63ff]" />,
  label: "Try the demo",
  href: `/subscribe/${DEMO_PLATFORM_ID}`,
};

const noDemoStep: Step = {
  icon: <Sparkles size={14} className="text-[#94a3b8]" />,
  label: "Run pnpm seed:demo first",
  href: "#",
};

export default function GuidedDemoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  const steps: Step[] = [
    baseSteps[0],
    hasDemo ? demoStep : noDemoStep,
    baseSteps[1],
    baseSteps[2],
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative z-40 border-b border-white/10 bg-[#0a0a0f]/95 backdrop-blur"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="inline-block w-2 h-2 rounded-full bg-[#6c63ff] animate-pulse" />
              <span className="text-xs font-medium text-white">Guided Demo</span>
            </div>

            <ol className="flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0 text-sm">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                const isDisabled = !hasDemo && step.href === "#";
                const className =
                  "group flex items-center gap-1.5 sm:flex-1 sm:px-3 py-1 rounded-md text-[#94a3b8] hover:text-white hover:bg-white/5 transition-colors";
                const content = (
                  <>
                    <span className="font-mono text-[10px] text-[#6c63ff] shrink-0">
                      {i + 1}
                    </span>
                    <span className="shrink-0">{step.icon}</span>
                    <span className="truncate">{step.label}</span>
                  </>
                );

                if (isDisabled) {
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-1.5 sm:flex-1 sm:px-3 py-1 rounded-md text-[#64748b] cursor-not-allowed"
                      title="Run pnpm seed:demo to enable the live demo"
                    >
                      {content}
                    </li>
                  );
                }

                return (
                  <li
                    key={i}
                    className={`flex items-center sm:flex-1 ${isLast ? "" : "sm:after:content-['→'] sm:after:ml-auto sm:after:text-white/20 sm:after:pr-3"}`}
                  >
                    <a
                      href={step.href}
                      target={step.external ? "_blank" : undefined}
                      rel={step.external ? "noopener noreferrer" : undefined}
                      className={className}
                    >
                      {content}
                    </a>
                  </li>
                );
              })}
            </ol>

            <button
              onClick={dismiss}
              aria-label="Dismiss guided demo banner"
              className="shrink-0 p-1 rounded-md text-[#94a3b8] hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
