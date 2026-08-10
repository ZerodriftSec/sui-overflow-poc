import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle, Zap, Shield, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

export default function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);


  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-12">
      {/* Background Elements */}
      <div className="absolute inset-0 grid-pattern" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 30 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {/* <div className="inline-flex items-center gap-2 glass-card px-4 py-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse" />
              <span className="text-sm text-text-secondary">Built on Sui Blockchain</span>
            </div> */}

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              <span className="text-white">Automate Your Crypto Subscriptions. </span>
              <span className="gradient-text">Zero Chargebacks.</span>
            </h1>

            <p className="text-lg text-text-secondary mb-8 max-w-xl leading-relaxed">
              Stop losing MRR to manual crypto payments. Your customers connect their wallet once, and our smart contracts handle the recurring billing. Same-day integration. 3% flat fee.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 mb-12">
              <Button
                href="https://app.usepaystreamer.xyz"
                onClick={() => setMounted(false)} // triggers exit animation before navigation or simply provides interaction feedback
                loading={!mounted}
                variant="gradient"
                size="lg"
                className="text-lg"
              >
                <span>Get Started</span>
              </Button>
              <Button 
                href={import.meta.env.DEV ? 'http://localhost:3001' : 'https://docs.usepaystreamer.xyz'}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary" 
                size="lg" 
                className="text-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <span>Documentation</span>
              </Button>
            </div>

            <div className="mb-12">
              <a
                href="https://checkout.usepaystreamer.xyz"
                className="group inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors text-sm font-medium"
              >
                <Sparkles size={16} className="text-accent-primary group-hover:text-accent-secondary transition-colors" />
                <span>Try a live demo</span>
                <ArrowRight size={14} className="opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </a>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-accent-success" />
                <span className="text-sm text-text-secondary">3% per transaction</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-accent-success" />
                <span className="text-sm text-text-secondary">No setup fees</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-accent-success" />
                <span className="text-sm text-text-secondary">Zero chargebacks</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-accent-success" />
                <span className="text-sm text-text-secondary">Built on Sui</span>
              </div>
            </div>
          </motion.div>

          {/* Right - Subscription Demo */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: mounted ? 1 : 0, x: mounted ? 0 : 50 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative lg:scale-95 origin-right"
          >
            <div className="glass-card p-6 relative">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
                    <Shield size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Your Platform Treasury</div>
                    <div className="text-xs text-text-secondary font-mono">0x4a9b...2f1c</div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-accent-success/20 text-accent-success text-xs font-medium">
                  Verified
                </span>
              </div>

              {/* Balance */}
              <div className="bg-black/40 rounded-xl p-4 mb-6">
                <div className="text-sm text-text-secondary mb-2">Total Revenue</div>
                <div className="text-3xl font-bold text-white mb-1">$45,250.00</div>
                <div className="text-sm text-text-secondary">USDC on Sui</div>
              </div>

              {/* Policies */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-text-secondary">Monthly Churn Rate</span>
                    <span className="text-accent-success font-medium">-2.4%</span>
                  </div>
                  <div className="policy-bar" style={{ '--withdraw-percent': '15%' } as React.CSSProperties} />
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-text-secondary">Next Automated Batch</span>
                    <span className="text-white font-medium">in 45 mins</span>
                  </div>
                  <div className="bg-black/40 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent-secondary/20 flex items-center justify-center">
                          <Zap size={16} className="text-accent-secondary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Pro Tier Billing</div>
                          <div className="text-xs text-text-secondary">1,240 users</div>
                        </div>
                      </div>
                      <span className="text-xs text-text-secondary text-accent-success">+$12,400</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscriptions List */}
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="text-sm text-text-secondary mb-3">Recent Subscribers</div>
                {[
                  { name: '0x8f...3d', tier: 'Pro Tier', amount: '+$10.00', color: 'var(--color-accent-success)' },
                  { name: '0x1a...9c', tier: 'Basic Tier', amount: '+$5.00', color: 'var(--color-accent-success)' },
                  { name: '0x4c...2a', tier: 'Pro Tier', amount: '+$10.00', color: 'var(--color-accent-success)' },
                ].map((sub, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: '#ffffff10' }}>
                        <div className="w-full h-full rounded-lg flex items-center justify-center text-white">
                          {/* <Users size={14} /> */}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-mono text-white">{sub.name}</div>
                        <div className="text-xs text-text-secondary">{sub.tier}</div>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-accent-success">{sub.amount}</span>
                  </div>
                ))}
              </div>

              {/* Trust Badge */}
              {/* <div className="absolute -bottom-4 -right-4 glass-card px-4 py-2">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-accent-primary" />
                  <span className="text-xs text-text-secondary">Smart contract audited</span>
                </div>
              </div> */}
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: mounted ? 1 : 0 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={shouldReduceMotion ? { y: 0 } : { y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2"
        >
          <div className="w-1.5 h-3 bg-white/50 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  );
}
