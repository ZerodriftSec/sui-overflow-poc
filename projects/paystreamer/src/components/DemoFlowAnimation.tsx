import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Clock, CheckCircle2, ExternalLink, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';

type Stage = 'subscribe' | 'due' | 'paid';

const STAGE_DURATION = 1800;

const STAGES: { key: Stage; label: string; detail: string; icon: React.ReactNode; accent: string }[] = [
  {
    key: 'subscribe',
    label: 'Subscribe',
    detail: 'Approve once',
    icon: <Wallet size={20} className="text-white" />,
    accent: 'var(--color-accent-primary)',
  },
  {
    key: 'due',
    label: 'Due',
    detail: 'Next payment due',
    icon: <Clock size={20} className="text-white" />,
    accent: 'var(--color-accent-secondary)',
  },
  {
    key: 'paid',
    label: 'Paid',
    detail: '0.001 PUSD sent',
    icon: <CheckCircle2 size={20} className="text-white" />,
    accent: 'var(--color-accent-success)',
  },
];

function SubscriptionHash() {
  const [hash, setHash] = useState('0x4a9b...2f1c');
  useEffect(() => {
    const id = setInterval(() => {
      const chars = '0123456789abcdef';
      let h = '0x';
      for (let i = 0; i < 3; i++) h += chars[Math.floor(Math.random() * chars.length)];
      h += '...';
      for (let i = 0; i < 3; i++) h += chars[Math.floor(Math.random() * chars.length)];
      setHash(h);
    }, 2200);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono">{hash}</span>;
}

function AgeTicker() {
  const [seconds, setSeconds] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s + 1) % 60), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{seconds}s ago</span>;
}

import { useAppConfig } from '../hooks/useAppConfig';

export default function DemoFlowAnimation() {
  const [index, setIndex] = useState(0);
  const config = useAppConfig();

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % STAGES.length);
    }, STAGE_DURATION);
    return () => clearInterval(id);
  }, []);

  const current = STAGES[index];
  const isPaid = current.key === 'paid';

  return (
    <section
      aria-label="Live demo animation"
      className="relative py-16 overflow-hidden"
    >
      <div className="absolute inset-0 bg-bg-primary" />
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-accent-primary/10 text-accent-primary text-sm font-medium mb-3">
            Live Demo
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            One signature. <span className="gradient-text">Automated forever.</span>
          </h2>
          <p className="text-text-secondary text-sm sm:text-base max-w-xl mx-auto">
            Watch the full subscription lifecycle loop in real time.
          </p>
        </motion.div>

        <div className="relative">
          <div
            className="glass-card p-6 sm:p-8 relative overflow-hidden"
            style={{ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full bg-accent-success"
                  style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                />
                <span className="text-xs uppercase tracking-wider text-text-secondary">
                  Live
                </span>
              </div>
              <span className="text-xs text-text-secondary font-mono">{config.network}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 relative">
              {STAGES.map((stage, i) => {
                const isActive = i === index;
                const isPast = i < index;
                return (
                  <div key={stage.key} className="relative">
                    <motion.div
                      animate={{
                        opacity: isActive ? 1 : isPast ? 0.55 : 0.35,
                        scale: isActive ? 1.02 : 1,
                        borderColor: isActive ? stage.accent : 'rgba(255,255,255,0.1)',
                      }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="relative rounded-xl p-4 border bg-black/30 h-full"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isActive
                              ? `linear-gradient(135deg, ${stage.accent}, ${stage.accent}cc)`
                              : 'rgba(255,255,255,0.05)',
                          }}
                        >
                          {stage.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-text-secondary font-mono">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs text-text-secondary">/</span>
                            <span className="text-xs text-text-secondary font-mono">03</span>
                          </div>
                          <div className="text-white font-semibold text-sm">
                            {stage.label}
                          </div>
                          <div className="text-text-secondary text-xs mt-0.5">
                            {stage.detail}
                          </div>

                          {stage.key === 'due' && isActive && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-accent-secondary"
                                style={{ animation: 'pulse 1s ease-in-out infinite' }}
                              />
                              <span className="text-[10px] text-accent-secondary uppercase tracking-wider">
                                pending
                              </span>
                            </div>
                          )}

                          {stage.key === 'paid' && isActive && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-accent-success"
                                style={{ animation: 'pulse 1s ease-in-out infinite' }}
                              />
                              <span className="text-[10px] text-accent-success uppercase tracking-wider">
                                confirmed
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>

                    {i < STAGES.length - 1 && (
                      <div className="hidden sm:block absolute top-1/2 -right-2 w-4 h-px bg-gradient-to-r from-white/20 to-transparent" />
                    )}
                  </div>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {isPaid && (
                <motion.a
                  key="tx-badge"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  href={`https://suiscan.xyz/${config.network}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-success/15 border border-accent-success/30 text-accent-success text-[10px] font-medium"
                >
                  <CheckCircle2 size={11} />
                  <span>tx confirmed</span>
                  <ExternalLink size={9} className="opacity-70" />
                </motion.a>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 flex items-center justify-center gap-2 text-xs text-text-secondary font-mono"
          >
            <Activity size={12} className="text-accent-success" />
            <span>
              Subscription <SubscriptionHash /> paid 0.001 PUSD <AgeTicker />
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
