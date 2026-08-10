import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { useCurrentAccount, useCurrentNetwork } from "@mysten/dapp-kit-react";
import { PayStreamerProvider, PayStreamerConfig } from "@paystreamer/sdk/react";
import { SetupSubscriptionModal } from "@paystreamer/sdk/ui";
import { usePlatform } from "@paystreamer/sdk/react";
import { formatMistToPusd, formatFrequencyMsToDays } from "@paystreamer/sdk/core";
import { NETWORK_CONFIGS, SupportedNetwork, CLOCK_OBJECT_ID } from "@paystreamer/sdk";
import { CheckCircle, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";

function CheckoutExperience() {
  const { platformId } = useParams<{ platformId: string }>();
  const account = useCurrentAccount();
  const modalRef = useRef<any>(null);
  
  const { data: platform, isLoading: platformLoading } = usePlatform(platformId);
  const platformJson = platform;
  
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);
  const [selectedTierParams, setSelectedTierParams] = useState<{
    index: number;
  } | null>(null);

  const activeTiers = platform?.tiers?.filter(t => t.is_active !== false) || [];

  const handleSubscribeClick = (tierIndex: number) => {
    if (!account) {
      modalRef.current?.show();
      return;
    }
    setSelectedTierParams({ index: tierIndex });
    setIsSetupModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="noise" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12">
        {platformLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
          </div>
        ) : !platform || !platformJson ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-4">Platform Not Found</h2>
            <p className="text-[#94a3b8]">This platform does not exist or has been removed.</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-12">
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                {platformJson.name ?? "Unnamed Platform"}
              </h1>
              {platformJson.description && (
                <p className="text-lg text-[#94a3b8] max-w-2xl mx-auto mb-4">
                  {platformJson.description}
                </p>
              )}
            </div>

            {subscriptionSuccess ? (
              <div className="max-w-md mx-auto text-center border border-[#10b981]/30 bg-[#10b981]/5 rounded-xl p-8">
                <CheckCircle className="h-16 w-16 text-[#10b981] mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">You're subscribed!</h2>
              </div>
            ) : (
              <div className={`grid gap-6 ${activeTiers.length === 1 ? "max-w-md mx-auto" : "md:grid-cols-2 lg:grid-cols-3"}`}>
                {activeTiers.map((tier, index) => (
                  <div key={index} className="relative overflow-hidden bg-[#151520] border border-white/10 rounded-xl p-6">
                    <h3 className="text-xl font-bold mb-4">{tier.name}</h3>
                    <div className="text-2xl font-bold text-white mb-6">
                      {formatMistToPusd(tier.amount)} PUSD
                      <span className="text-sm font-normal text-[#94a3b8]">
                        {" "}/ {formatFrequencyMsToDays(tier.frequency)} days
                      </span>
                    </div>
                    {!account ? (
                      <button
                        onClick={() => modalRef.current?.show()}
                        className="w-full bg-[#6c63ff] hover:bg-[#5a52d5] transition-colors text-white py-2 rounded-lg"
                      >
                        Connect to Subscribe
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribeClick(index)}
                        className="w-full bg-[#6c63ff] hover:bg-[#5a52d5] transition-colors text-white py-2 rounded-lg"
                      >
                        Subscribe
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      
      <ConnectModal ref={modalRef} />

      {selectedTierParams && (
        <SetupSubscriptionModal
          isOpen={isSetupModalOpen}
          onClose={() => {
            setIsSetupModalOpen(false);
            setSelectedTierParams(null);
          }}
          platformId={platformId!}
          tierIndex={selectedTierParams.index}
          onSuccess={() => {
            setIsSetupModalOpen(false);
            setSubscriptionSuccess(true);
          }}
        />
      )}
    </div>
  );
}

function CheckoutProvider({ children }: { children: React.ReactNode }) {
  const currentNetwork = useCurrentNetwork() as SupportedNetwork;
  const network = currentNetwork || "testnet";
  const networkConfig = NETWORK_CONFIGS[network] || NETWORK_CONFIGS.testnet!;
  
  const config: PayStreamerConfig = {
    network,
    packageId: networkConfig.PACKAGE_ID,
    registryId: networkConfig.COIN_TYPE_REGISTRY_ID,
    clockId: CLOCK_OBJECT_ID,
    pusdType: networkConfig.PUSD_TYPE_ARG,
    sponsorApiUrl: import.meta.env.VITE_SPONSOR_API_URL || "http://localhost:3000/sponsor",
  };

  return <PayStreamerProvider config={config}>{children}</PayStreamerProvider>;
}

export default function App() {
  return (
    <CheckoutProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/:platformId" element={<CheckoutExperience />} />
        </Routes>
      </BrowserRouter>
    </CheckoutProvider>
  );
}
