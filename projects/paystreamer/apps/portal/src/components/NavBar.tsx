import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, LogOut } from 'lucide-react';
import { ConnectModal } from '@mysten/dapp-kit-react/ui';
import { useCurrentAccount, useDAppKit, useWalletConnection, useCurrentClient } from '@mysten/dapp-kit-react';
import { Button } from "@paystreamer/sdk";
import NetworkSelector from './NetworkSelector';
import { useMintTestPusd } from '@paystreamer/sdk/react';
import { TxStatusToast, TxStatus } from './TxStatusToast';
import { parseMoveError } from '../lib/errors';
import { useQueryClient } from '@tanstack/react-query';

export default function NavBar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState("");
  
  const modalRef = useRef<any>(null);
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const { isConnecting } = useWalletConnection();
  const { mint: mintPusd } = useMintTestPusd();
  const disconnect = () => dAppKit.disconnectWallet();
  console.log("WALLETS:", dAppKit.stores.$wallets.get());
  const isPending = txStatus === "pending";

  const handleMintPusd = async () => {
    setTxStatus("pending");
    setTxMessage("Minting Test PUSD...");
    try {
      const result = await mintPusd();
      if (!result) throw new Error("Transaction failed");
      const txDigest = result;
      
      await client.waitForTransaction({ digest: txDigest });
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["sui-client", "getCoins"] });
        await queryClient.invalidateQueries({ queryKey: ["sui-client", "getAllBalances"] });
        setTxStatus("success");
        setTxMessage("Successfully minted 1,000 PUSD!");
        setTxDigest(txDigest);
      }, 1000);
    } catch (err) {
      console.error("Mint Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

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
          isScrolled ? 'bg-[#0a0a0f]/90 backdrop-blur-md border-b py-3' : 'py-5'
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
                  className="text-[#94a3b8] hover:text-white transition-colors text-sm font-medium whitespace-nowrap"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Wallet Button */}
            <div className="hidden md:flex items-center gap-3">
              <NetworkSelector />
              {account && (
                <Button
                  onClick={handleMintPusd}
                  disabled={isPending}
                  loading={isPending}
                  variant="outline"
                  className="flex items-center gap-2 text-sm px-4 py-2 border-[#6c63ff]/50 text-[#6c63ff] hover:bg-[#6c63ff]/10"
                  title="Get 1000 PUSD"
                >
                  Mint PUSD
                </Button>
              )}
              {account ? (
                <Button
                  onClick={() => disconnect()}
                  variant="secondary"
                  className="flex items-center gap-2 text-sm px-4 py-2"
                  title="Disconnect"
                >
                  <span className="font-mono">
                    {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </span>
                  <LogOut size={16} />
                </Button>
              ) : isConnecting ? (
                <Button disabled className="flex items-center justify-center text-sm px-6 py-2" variant="gradient">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => modalRef.current?.show()}
                    className="text-sm px-6 py-2"
                    variant="gradient"
                  >
                    Connect Wallet
                  </Button>
                  <ConnectModal ref={modalRef} />
                </>
              )}
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
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-[#12121a] p-6 pt-20">
              <div className="flex flex-col gap-4">
                <NetworkSelector variant="mobile" />
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-lg text-[#94a3b8] hover:text-white py-3 border-b border-white/10"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-4 flex justify-center">
                  {account ? (
                    <Button
                      onClick={() => disconnect()}
                      variant="secondary"
                      className="flex items-center justify-center gap-2 text-sm px-6 py-3 w-full"
                    >
                      <span className="font-mono">
                        {account.address.slice(0, 6)}...{account.address.slice(-4)}
                      </span>
                      <LogOut size={16} />
                    </Button>
                  ) : isConnecting ? (
                    <Button disabled className="flex items-center justify-center text-sm px-6 py-3 w-full" variant="gradient">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        modalRef.current?.show();
                      }}
                      className="text-sm px-6 py-3 w-full"
                      variant="gradient"
                    >
                      Connect Wallet
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TxStatusToast
        status={txStatus}
        message={txMessage}
        digest={txDigest}
        onClose={() => setTxStatus("idle")}
      />
    </>
  );
}