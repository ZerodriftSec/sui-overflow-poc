import { motion } from 'framer-motion';
import { Lock, Eye, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function SecuritySection() {
  return (
    <section id="security" className="relative pt-32 pb-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg-primary via-bg-secondary to-bg-primary" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-accent-primary/10 text-accent-primary text-sm font-medium mb-4">
            Security & Compliance
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Reduce Your <span className="gradient-text">Liability</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            Stop holding user funds on your servers. Leverage Sui's decentralized architecture to eliminate regulatory risk and hacking vectors.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left - Shared Object Visualization */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass-card p-8"
          >
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/20 flex items-center justify-center">
                <Lock size={20} className="text-accent-primary" />
              </div>
              Trustless Architecture
            </h3>

            {/* Visual Diagram */}
            <div className="relative bg-black/40 rounded-2xl p-6 mb-6">
              {/* Object Container */}
              <div className="border-2 border-dashed border-accent-primary/30 rounded-xl p-6">
                <div className="text-xs text-text-secondary mb-4 font-mono">account::SubscriptionAccount</div>

                {/* Balance */}
                <div className="bg-accent-success/10 border border-accent-success/30 rounded-lg p-4 mb-4">
                  <div className="text-sm text-accent-success mb-1">Balance</div>
                  <div className="text-2xl font-bold text-white">$1,250.00 USDC</div>
                </div>

                {/* Policies */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-sm text-text-secondary">Max Monthly</span>
                    <span className="text-sm font-mono text-white">$100.00</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-sm text-text-secondary">Max Per Transaction</span>
                    <span className="text-sm font-mono text-white">$50.00</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <span className="text-sm text-text-secondary">Min Balance</span>
                    <span className="text-sm font-mono text-white">$25.00</span>
                  </div>
                </div>
              </div>

              {/* Access Lines */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-bg-secondary border border-white/10 rounded-full">
                <span className="text-xs text-text-secondary">Owner: You</span>
              </div>
            </div>

            {/* Capabilities */}
            <div className="space-y-3">
              {[
                { label: 'Withdrawal capability', granted: true },
                { label: 'Policy modification', granted: true },
                { label: 'Account closure', granted: true },
                { label: 'Platform access (limited)', granted: true }
              ].map((cap, i) => (
                <div key={i} className="flex items-center gap-3">
                  {cap.granted ? (
                    <CheckCircle2 size={16} className="text-accent-success" />
                  ) : (
                    <AlertTriangle size={16} className="text-accent-warning" />
                  )}
                  <span className="text-sm text-text-secondary">{cap.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right - Security Features */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-card p-8"
          >
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-success/20 flex items-center justify-center">
                <Eye size={20} className="text-accent-success" />
              </div>
              Platform Benefits
            </h3>

            <div className="space-y-6">
              <div className="glass-card p-5 bg-black/20">
                <h4 className="text-white font-medium mb-2">Non-Custodial Design</h4>
                <p className="text-sm text-text-secondary">
                  Users hold their own funds in shared objects. You never touch their money until the exact moment a subscription is billed.
                </p>
              </div>

              <div className="glass-card p-5 bg-black/20">
                <h4 className="text-white font-medium mb-2">Eliminated Chargebacks</h4>
                <p className="text-sm text-text-secondary">
                  Blockchain finality means zero chargeback fraud. Once a withdrawal is executed, it's cryptographically guaranteed.
                </p>
              </div>

              <div className="glass-card p-5 bg-black/20">
                <h4 className="text-white font-medium mb-2">Permissionless Execution</h4>
                <p className="text-sm text-text-secondary">
                  Withdrawals are permissionless. Anyone (or any decentralized cron network) can process due payments without needing sensitive admin keys.
                </p>
              </div>

              <div className="glass-card p-5 bg-black/20">
                <h4 className="text-white font-medium mb-2">Immutable Treasury Routing</h4>
                <p className="text-sm text-text-secondary">
                  Move smart contracts hardcode the flow of funds. Withdrawals can only ever arrive at your designated Platform Treasury address.
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Policy Enforcement Demo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-24 glass-card p-8 max-w-4xl mx-auto"
        >
          <h3 className="text-xl font-semibold text-white text-center mb-8">How Automated Routing Works</h3>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent-primary/20 flex items-center justify-center mx-auto mb-4">
                <RefreshCw size={24} className="text-accent-primary" />
              </div>
              <h4 className="text-white font-medium mb-2">Scheduler Bot</h4>
              <p className="text-sm text-text-secondary">
                Your server automatically detects due subscriptions and executes a batch withdrawal.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent-secondary/20 flex items-center justify-center mx-auto mb-4">
                <Eye size={24} className="text-accent-secondary" />
              </div>
              <h4 className="text-white font-medium mb-2">Contract Validation</h4>
              <p className="text-sm text-text-secondary">
                Smart contracts evaluate on-chain time policies and ensure the requested users are actually due for billing before any funds move.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={24} className="text-accent-success" />
              </div>
              <h4 className="text-white font-medium mb-2">Direct Settlement</h4>
              <p className="text-sm text-text-secondary">
                Funds are routed directly into your platform's treasury. Your bot never touches the money.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}