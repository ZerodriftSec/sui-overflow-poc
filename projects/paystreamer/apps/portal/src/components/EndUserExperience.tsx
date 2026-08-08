import { motion } from 'framer-motion';
import { Ban, AlertTriangle, CreditCard } from 'lucide-react';

export default function EndUserExperience() {
  const features = [
    {
      icon: <Ban size={24} className="text-[#ef4444]" />,
      title: 'Manual Transactions',
      description: 'Stop chasing users for monthly payments. Your users shouldn\'t need to sign a transaction every billing cycle.',
    },
    {
      icon: <AlertTriangle size={24} className="text-[#f59e0b]" />,
      title: 'Accidental Churn',
      description: 'You lose subscribers every month because they forgot to pay. Automated billing keeps them subscribed.',
    },
    {
      icon: <CreditCard size={24} className="text-[#6c63ff]" />,
      title: 'High Payment Fees',
      description: 'Stop losing 2.9% + 30¢ to credit card processors. Crypto payments cost a fraction of that.',
    }
  ];

  return (
    <section id="the-problem" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#0a0a0f]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-[#ef4444]/10 text-[#ef4444] text-sm font-medium mb-4">
            The Problem
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Why Platform Operators Choose <span className="gradient-text">PayStreamer</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Running a Web3 platform means billing users without the tools that make billing work. PayStreamer fixes that.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="glass-card p-6 group border border-white/5 hover:border-white/10"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#12121a] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}