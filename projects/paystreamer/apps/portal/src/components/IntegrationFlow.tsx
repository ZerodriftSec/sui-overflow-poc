import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Zap,
  Lock,
} from 'lucide-react';

interface StepProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  code?: string;
  delay: number;
}

function FlowStep({ number, icon, title, description, code, delay }: StepProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [delay]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 30 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex-1 min-w-[280px] max-w-[320px]"
    >
      <div className="glass-card p-6 h-full relative">
        {/* Connector Line */}
        {number < 3 && (
          <div className="hidden lg:block absolute top-1/2 -right-[calc(50%-160px)] w-[calc(100%-320px)] h-0.5 bg-gradient-to-r from-[#6c63ff] to-[#3b82f6] opacity-30" />
        )}

        {/* Step Number */}
        <div className="absolute -top-3 left-6">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6c63ff] to-[#3b82f6] flex items-center justify-center text-sm font-bold text-white">
            {number}
          </div>
        </div>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6c63ff]/20 to-[#3b82f6]/20 flex items-center justify-center mb-4 mt-4">
          {icon}
        </div>

        {/* Content */}
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-[#94a3b8] text-sm mb-4">{description}</p>

        {/* Code Snippet */}
        {code && (
          <div className="code-snippet text-xs mt-auto">
            <code className="text-[#10b981]">{code}</code>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function IntegrationFlow() {
  const steps = [
    {
      icon: <Building2 size={28} className="text-[#6c63ff]" />,
      title: 'Step 1: Connect',
      description: 'Integrate our API or drop in our checkout widget to your existing platform.',
      code: 'register_platform("My SaaS")'
    },
    {
      icon: <Lock size={28} className="text-[#6c63ff]" />,
      title: 'Step 2: Subscribe',
      description: 'Customers approve a spending limit with a single wallet signature.',
      code: 'authorize_platform(wallet)'
    },
    {
      icon: <Zap size={28} className="text-[#10b981]" />,
      title: 'Step 3: Collect',
      description: 'Our smart contracts execute the payments automatically every billing cycle.',
      code: 'batch_withdraw_scheduler()'
    }
  ];

  return (
    <section id="how-it-works" className="relative pt-24 pb-40 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-[#6c63ff]/10 text-[#6c63ff] text-sm font-medium mb-4">
            Integration Flow
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Power Your Cashflow on <span className="gradient-text">Sui</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            A developer-friendly, trustless subscription protocol designed to scale with your platform's needs.
          </p>
        </motion.div>

        {/* Flow Steps */}
        <div className="flex flex-col lg:flex-row gap-6 justify-between items-stretch lg:items-center max-w-6xl mx-auto mt-16">
          {steps.map((step, index) => (
            <FlowStep
              key={index}
              number={index + 1}
              icon={step.icon}
              title={step.title}
              description={step.description}
              code={step.code}
              delay={index * 150}
            />
          ))}
        </div>
      </div>
    </section>
  );
}