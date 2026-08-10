import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { ArrowRight, Users, CheckCircle } from "lucide-react";
import NavBar from "../components/NavBar";
import HeroSection from "../components/HeroSection";
import IntegrationFlow from "../components/IntegrationFlow";
import EndUserExperience from "../components/EndUserExperience";
import CoreFeatures from "../components/CoreFeatures";
import SecuritySection from "../components/SecuritySection";
import { Button } from "@paystreamer/sdk";
import {  GRAPHQL_URL } from "@paystreamer/sdk";
import { useAppConfig } from "../hooks/useAppConfig";

const PLATFORM_FEE_PERCENT = 3;

interface PlatformInfo {
  name: string;
  category: string;
}

export default function LandingPage() {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const { isConnecting } = useWalletConnection();
  const navigate = useNavigate();
  const modalRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: recentPlatforms } = useQuery({
    queryKey: ["recent-platforms", config.network],
    queryFn: async () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgoTimestamp = Math.floor(thirtyDaysAgo / 1000);

      const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetRecentPlatforms($after: String) {
              events(
                first: 50,
                after: $after,
                filter: {
                  type: "${config.PACKAGE_ID}::platform::PlatformRegistered",
                  timeRange: { startTime: "${thirtyDaysAgoTimestamp}" }
                }
              ) {
                nodes {
                  contents { json }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
          variables: {},
        }),
      });

      const data = await res.json();
      const events = data.data?.events?.nodes || [];
      const seen = new Set<string>();
      const platforms: PlatformInfo[] = [];

      for (const event of events) {
        const json = event.contents?.json;
        if (json?.platform_id && !seen.has(json.platform_id)) {
          seen.add(json.platform_id);
          platforms.push({
            name: json.name || "Unnamed Platform",
            category: json.category || "General",
          });
        }
      }

      return platforms;
    },
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="noise" />
      <NavBar />
      {/* <GuidedDemoBanner /> */}

      <main>
        <HeroSection />

        {recentPlatforms && recentPlatforms.length > 0 && (
          <section className="relative py-16 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#0a0a0f]" />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: mounted ? 1 : 0, y: mounted ? 0 : 20 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-8"
              >
                <div className="inline-flex items-center gap-2 glass-card px-4 py-2 mb-4">
                  <Users className="h-4 w-4 text-[#10b981]" />
                  <span className="text-sm text-[#94a3b8]">
                    {recentPlatforms.length} platform{recentPlatforms.length !== 1 ? "s" : ""} accepting payments
                  </span>
                </div>

                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  {recentPlatforms.slice(0, 6).map((platform, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: mounted ? 1 : 0, scale: mounted ? 1 : 0.9 }}
                      transition={{ duration: 0.4, delay: 0.1 * index }}
                      className="glass-card px-4 py-2 flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                      <span className="text-sm text-white">{platform.name}</span>
                      <span className="text-xs text-[#94a3b8]">({platform.category})</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>
        )}


        <IntegrationFlow />

        <section className="relative py-24 overflow-hidden">
          <div className="absolute inset-0 bg-[#0a0a0f]" />
          <div className="absolute inset-0 grid-pattern opacity-30" />

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-4 py-2 rounded-full bg-[#10b981]/10 text-[#10b981] text-sm font-medium mb-4">
                Simple Pricing
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                PayStreamer takes <span className="gradient-text">{PLATFORM_FEE_PERCENT}%</span> per successful payment
              </h2>
              <p className="text-lg text-[#94a3b8] mb-8 max-w-2xl mx-auto">
                No setup fees. No monthly fees. No hidden costs.
              </p>

              <div className="flex flex-wrap justify-center gap-6">
                {[
                  { icon: <CheckCircle size={20} className="text-[#10b981]" />, text: "Zero setup fees" },
                  { icon: <CheckCircle size={20} className="text-[#10b981]" />, text: "No monthly fees" },
                  { icon: <CheckCircle size={20} className="text-[#10b981]" />, text: "No hidden costs" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[#94a3b8]">
                    {item.icon}
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <EndUserExperience />
        <CoreFeatures />

        <SecuritySection />

        <section className="relative py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#12121a] to-[#0a0a0f]" />
          <div className="orb orb-1 absolute -top-40 -left-40 w-[500px] h-[500px] opacity-20" />
          <div className="orb orb-2 absolute -bottom-40 -right-40 w-[400px] h-[400px] opacity-20" />

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                Ready to scale your recurring revenue on <span className="gradient-text">Web3?</span>
              </h2>
              <p className="text-[#94a3b8] text-lg mb-10 max-w-2xl mx-auto">
                Join the leading platforms powering their subscriptions with Sui's trustless infrastructure.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                {account ? (
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                      onClick={() => navigate("/platforms")}
                      className="flex items-center justify-center gap-2 text-lg px-8 py-4"
                    >
                      <span>Platform Portal</span>
                      <ArrowRight size={20} />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/dashboard")}
                      className="flex items-center justify-center gap-2 text-lg px-8 py-4 bg-transparent border-white/20 hover:bg-white/10"
                    >
                      <span>Subscriber Dashboard</span>
                    </Button>
                  </div>
                ) : isConnecting ? (
                  <Button disabled className="flex items-center justify-center gap-2 text-lg px-10 py-4">
                    <Loader2 className="animate-spin h-6 w-6" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => modalRef.current?.show()}
                    className="flex items-center justify-center gap-2 text-lg px-10 py-4"
                    variant="gradient"
                  >
                    <span>Create Free Platform</span>
                    <ArrowRight size={20} />
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-6 text-sm text-[#94a3b8]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span>Zero setup fees</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span>No chargebacks</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span>Automated routing</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span>Built on Sui</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

      </main>

      <footer className="relative py-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-8 mb-12">
            <div className="max-w-sm">
              <a href="#" className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="PayStreamer Logo" className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(108,99,255,0.5)]" />
                <span className="text-xl font-bold text-white">PayStreamer</span>
              </a>
              <p className="text-sm text-[#94a3b8]">
                Empowering users with full control over their subscription payments on the Sui blockchain.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10 gap-4">
            <div className="text-sm text-[#94a3b8]">
              © 2026 PayStreamer. Built on Sui Network.
            </div>

            <div className="flex items-center gap-4 text-sm">
              <a href="https://github.com/paystreamer" target="_blank" rel="noopener noreferrer" className="text-[#94a3b8] hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>

      <ConnectModal ref={modalRef} />
    </div>
  );
}