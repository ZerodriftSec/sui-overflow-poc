import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Button } from './ui/button';

export default function NavBar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'The Problem', href: '/#the-problem' },
    { label: 'Platform Features', href: '/#for-platforms' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/#security' },
  ];

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-bg-primary/90 backdrop-blur-md border-b py-3' : 'py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a href="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="PayStreamer Logo" className="w-14 h-14 object-contain drop-shadow-[0_0_8px_rgba(108,99,255,0.5)]" />
              <span className="text-xl font-bold text-white">PayStreamer</span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden xl:flex items-center gap-6">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-text-secondary hover:text-white transition-colors text-sm font-medium whitespace-nowrap"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Action Button */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                href="https://app.usepaystreamer.xyz"
                onClick={() => setIsNavigating(true)}
                loading={isNavigating}
                className="text-sm px-6 py-2 shadow-[0_0_15px_rgba(108,99,255,0.4)] hover:shadow-[0_0_25px_rgba(108,99,255,0.6)] transition-shadow"
                variant="gradient"
              >
                Launch App
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden text-white p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-bg-secondary p-6 pt-20">
              <div className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg text-text-secondary hover:text-white py-3 border-b border-white/10"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-4 flex justify-center">
                  <Button
                    href="https://app.usepaystreamer.xyz"
                    onClick={() => setIsNavigating(true)}
                    loading={isNavigating}
                    className="text-sm px-6 py-3 w-full shadow-[0_0_15px_rgba(108,99,255,0.4)]"
                    variant="gradient"
                  >
                    Launch App
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}