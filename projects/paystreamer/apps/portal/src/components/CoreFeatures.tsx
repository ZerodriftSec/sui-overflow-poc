import { motion } from 'framer-motion';
import { Code2, DollarSign, Clock, ShieldCheck, Zap, BarChart3 } from 'lucide-react';

export default function CoreFeatures() {
  const benefits = [
    {
      icon: <Clock size={24} className="text-[#10b981]" />,
      title: 'One-Time Wallet Approval',
      description: 'Users sign a contract once; payments are pulled automatically thereafter. Secures predictable MRR by eliminating manual payment churn.'
    },
    {
      icon: <DollarSign size={24} className="text-[#6c63ff]" />,
      title: 'Stablecoin Settlement',
      description: 'Subscriptions are priced and settled in USDC/USDT (or other custom tokens). Protects your revenue from crypto volatility and simplifies accounting.'
    },
    {
      icon: <ShieldCheck size={24} className="text-[#3b82f6]" />,
      title: 'Zero Chargebacks',
      description: 'Blockchain transactions are final. Say goodbye to dispute overhead and chargeback fraud permanently.'
    },
    {
      icon: <Zap size={24} className="text-[#f59e0b]" />,
      title: 'Global Reach',
      description: 'Accept payments from anyone with a wallet, bypassing regional banking restrictions and complex localized gateways.'
    },
    {
      icon: <Code2 size={24} className="text-[#ec4899]" />,
      title: 'Developer API & Webhooks',
      description: 'Plug-and-play integration into your existing platform. Saves weeks of expensive, complex in-house engineering time.'
    },
    {
      icon: <BarChart3 size={24} className="text-[#6c63ff]" />,
      title: 'Real-time Analytics',
      description: 'Track subscription metrics, churn, and MRR directly from your integrated merchant dashboard.'
    }
  ];

  return (
    <section id="for-platforms" className="relative py-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] text-sm font-medium mb-4">
            Core Features
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Built for <span className="gradient-text">Developers</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            A secure, composable Move architecture designed for seamless automation and treasury management.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-start mb-16">
          {/* Left: Benefits Grid */}
          <div className="grid sm:grid-cols-2 gap-6">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="glass-card p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-[#12121a] flex items-center justify-center mb-4">
                  {benefit.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                <p className="text-[#94a3b8] text-xs leading-relaxed">{benefit.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Right: API Demo */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full sticky top-24"
          >
          <div className="glass-card overflow-hidden">
            {/* Code Header */}
            <div className="flex items-center gap-3 px-6 py-4 bg-black/30 border-b border-white/10">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm text-[#94a3b8] ml-4 font-mono">platform_integration.ts</span>
            </div>

            {/* Code Content */}
            <div className="p-6 font-mono text-sm">
              <pre className="text-[#94a3b8] leading-relaxed overflow-x-auto">
{`// 1. Register your platform and define tiers on-chain
tx.moveCall({
  target: '0xPKG::platform_registry::create_tier',
  arguments: [
    tx.object(platformOwnerCapId),
    tx.pure.u64(999), // $9.99
    tx.moveCall({
      target: '0xPKG::platform_registry::billing_frequency_monthly'
    })
  ]
});

// 2. Delegate automation securely using SchedulerCap
const { objects: caps } = await client.listOwnedObjects({
  owner: botWalletAddress,
  type: '0xPKG::platform_registry::SchedulerCap'
});

// 3. Your bot executes batch withdrawals automatically
tx.moveCall({
  target: '0xPKG::platform_registry::batch_withdraw_scheduler',
  arguments: [
    tx.object(schedulerCapId),
    tx.object(platformId),
    tx.makeMoveVec({ elements: dueAccounts }),
    tx.makeMoveVec({ type: 'u64', elements: amounts }),
    tx.object('0x6') // Clock
  ]
});

// Funds are instantly routed directly to your platform treasury.`}
              </pre>
            </div>
          </div>
        </motion.div>
        </div>

      </div>
    </section>
  );
}