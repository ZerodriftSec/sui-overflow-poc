import { motion } from 'framer-motion';
import { CheckCircle, HelpCircle, CreditCard, Shield, Globe, Zap } from 'lucide-react';
import NavBar from '../components/NavBar';

import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

const PLATFORM_FEE_PERCENT = 3;

const TRADITIONAL_FEATURES = [
  { name: 'Processing Fee', traditional: '2.9% + 30¢', paystreamer: '3%' },
  { name: 'Chargeback Risk', traditional: 'Yes — 1-3%', paystreamer: 'Zero' },
  { name: 'Settlement Time', traditional: '2-3 business days', paystreamer: 'Instant' },
  { name: 'Global Payments', traditional: 'Limited by region', paystreamer: 'Worldwide' },
  { name: 'Setup Fees', traditional: '$0-299', paystreamer: 'None' },
  { name: 'Monthly Fees', traditional: '$25-299', paystreamer: 'None' },
  { name: 'PCI Compliance', traditional: 'Required', paystreamer: 'Not required' },
  { name: 'Refunds', traditional: 'Full or partial', paystreamer: 'Not possible (final)' },
];

const FAQ_ITEMS = [
  {
    question: 'What happens if a subscriber has insufficient funds?',
    answer: 'The automated scheduler will retry on the next billing cycle. You only pay when the payment succeeds. Failed payments do not incur fees.',
  },
  {
    question: 'How do I receive funds?',
    answer: 'Payments are automatically routed to your Platform Treasury wallet on Sui. You can withdraw to any wallet or exchange at any time.',
  },
  {
    question: 'What currencies are supported?',
    answer: 'Currently USDC and SUI on Sui. Additional stablecoins can be added via the Coin Type Registry.',
  },
  {
    question: 'Can subscribers cancel their subscription?',
    answer: 'Yes. Subscribers can pause or cancel anytime from their dashboard. No cancellation fees.',
  },
  {
    question: 'What if I want to cancel PayStreamer?',
    answer: 'Cancel anytime, no contracts or commitments. Your existing subscriber data remains on-chain and accessible.',
  },
  {
    question: 'How are taxes handled?',
    answer: 'PayStreamer does not handle tax calculations. Platforms are responsible for their own tax compliance based on jurisdiction.',
  },
];

export default function PricingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="noise" />

      <NavBar />

      <main className="pt-32 pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              No setup fees. No monthly fees. No hidden costs. Pay only when you earn.
            </p>
          </motion.div>

          {/* Main Pricing Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="glass-card p-8 sm:p-12 text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-success/10 text-accent-success text-sm font-medium mb-6">
              <Zap size={16} />
              <span>Flat Rate — No Surprises</span>
            </div>

            <h2 className="text-5xl sm:text-6xl font-bold text-white mb-4">
              <span className="gradient-text">{PLATFORM_FEE_PERCENT}%</span>
            </h2>
            <p className="text-xl text-text-secondary mb-8">
              per successful payment
            </p>

            <div className="flex flex-wrap justify-center gap-6 mb-8">
              {[
                { icon: <CheckCircle size={20} className="text-accent-success" />, text: 'Zero setup fees' },
                { icon: <CheckCircle size={20} className="text-accent-success" />, text: 'No monthly fees' },
                { icon: <CheckCircle size={20} className="text-accent-success" />, text: 'No hidden costs' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-text-secondary">
                  {item.icon}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => navigate('/platforms')}
                className="text-lg px-8 py-4"
                variant="gradient"
              >
                Create Free Platform
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/explore')}
                className="text-lg px-8 py-4 bg-transparent border-white/20 hover:bg-white/10"
              >
                Browse Platforms
              </Button>
            </div>
          </motion.div>

          {/* Comparison Table */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-16"
          >
            <h2 className="text-3xl font-bold text-white text-center mb-8">
              vs. Traditional Payment Processors
            </h2>

            <div className="glass-card overflow-hidden">
              <div className="grid grid-cols-3 gap-4 p-6 border-b border-white/10">
                <div className="text-sm font-medium text-text-secondary">Feature</div>
                <div className="text-sm font-medium text-text-secondary text-center">Traditional</div>
                <div className="text-sm font-medium text-accent-success text-center">PayStreamer</div>
              </div>

              {TRADITIONAL_FEATURES.map((feature, i) => (
                <div
                  key={i}
                  className="grid grid-cols-3 gap-4 p-6 border-b border-white/10 last:border-0"
                >
                  <div className="text-white font-medium">{feature.name}</div>
                  <div className="text-center text-text-secondary">{feature.traditional}</div>
                  <div className="text-center text-accent-success font-medium">{feature.paystreamer}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid sm:grid-cols-3 gap-6 mb-16"
          >
            {[
              { icon: <Shield size={24} className="text-accent-success" />, title: 'No Chargebacks', desc: 'Blockchain-final transactions cannot be reversed' },
              { icon: <Globe size={24} className="text-accent-success" />, title: 'Global Reach', desc: 'Accept payments from any wallet, anywhere' },
              { icon: <CreditCard size={24} className="text-accent-success" />, title: 'No Credit Card', desc: 'Stablecoins only — no card network fees' },
            ].map((badge, i) => (
              <div key={i} className="glass-card p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-bg-secondary flex items-center justify-center mx-auto mb-4">
                  {badge.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{badge.title}</h3>
                <p className="text-sm text-text-secondary">{badge.desc}</p>
              </div>
            ))}
          </motion.div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white text-center mb-8">
              Frequently Asked Questions
            </h2>

            <div className="glass-card divide-y divide-white/10">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="p-6">
                  <div className="flex items-start gap-3">
                    <HelpCircle size={20} className="text-accent-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">{item.question}</h3>
                      <p className="text-text-secondary">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-center mt-16"
          >
            <p className="text-xl text-text-secondary mb-6">
              Ready to scale your recurring revenue on Web3?
            </p>
            <Button
              onClick={() => navigate('/platforms')}
              className="text-lg px-10 py-4"
              variant="gradient"
            >
              Create Free Platform
            </Button>
          </motion.div>
        </div>
      </main>

      <footer className="relative py-12 border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-text-secondary">
          <p>PayStreamer — Built on Sui Network</p>
        </div>
      </footer>
    </div>
  );
}
