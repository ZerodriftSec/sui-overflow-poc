import { useRef } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useQuery } from "@tanstack/react-query";
import { useOwnedPlatforms } from "../lib/platformDiscovery";
import {  queryAccountCreatedEvents, queryRecentEventsByType  } from "@paystreamer/sdk/core";
import { useTxToast, generateToastId } from "../components/TxStatusToast";
import { formatMistToPUSD } from "../lib/format";
import { useAppConfig } from "../hooks/useAppConfig";

export function usePaymentNotifications() {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const txToast = useTxToast();
  // Use a ref for lastSeenTimestamp to avoid triggering re-renders or getting stale closures
  // Add a 30s buffer to account for clock drift between local machine and fullnode
  const lastSeenRef = useRef(Date.now() - 30000);

  // 1. Get user's platforms
  const { data: platforms } = useOwnedPlatforms(account?.address ?? null);
  const platformIds = new Set(platforms?.map((p) => p.objectId) ?? []);

  // 2. Get user's accounts
  const { data: accountCreatedEvents } = useQuery({
    queryKey: ["account-created-events", account?.address, config.network],
    queryFn: async () => {
      if (!account?.address) return [];
      return await queryAccountCreatedEvents(account.address, config.network);
    },
    enabled: !!account?.address,
  });
  const accountIds = new Set(accountCreatedEvents?.map((e) => e.account_id) ?? []);

  // 3. Poll for recent payment events
  useQuery({
    queryKey: ["recent-payments-polling", account?.address, config.network],
    queryFn: async () => {
      if (!account?.address) return [];
      
      const [processedEvents, failedEvents] = await Promise.all([
        queryRecentEventsByType(
          `${config.PACKAGE_ID}::payment::PaymentProcessed`,
          20, config.network
        ),
        queryRecentEventsByType(
          `${config.PACKAGE_ID}::payment::PaymentFailed`,
          20, config.network
        )
      ]);

      const events = [
        ...processedEvents.map(e => ({ ...e, type: "processed" })),
        ...failedEvents.map(e => ({ ...e, type: "failed" }))
      ];

      let maxTimestamp = lastSeenRef.current;

      for (const event of events) {
        if (event.timestamp > lastSeenRef.current) {
          const json = event.json as { platform_id: string; account_id: string; amount?: string; reason?: string };
          
          const isOwner = platformIds.has(json.platform_id);
          const isSubscriber = accountIds.has(json.account_id);

          if (isOwner || isSubscriber) {
            const toastId = generateToastId();
            txToast.addToast(toastId);

            if (event.type === "processed" && json.amount) {
              const amountFormatted = formatMistToPUSD(json.amount);
              const message = isOwner 
                ? `Payment Received! ${amountFormatted}`
                : `Payment Successful! ${amountFormatted} sent`;
              txToast.confirmToast(toastId, event.transactionDigest, message);
            } else if (event.type === "failed" && json.reason) {
              const message = isOwner
                ? `Subscriber Payment Failed: ${json.reason}`
                : `Your Payment Failed: ${json.reason}`;
              txToast.failToast(toastId, new Error(message));
            }
          }
          
          if (event.timestamp > maxTimestamp) {
            maxTimestamp = event.timestamp;
          }
        }
      }

      if (maxTimestamp > lastSeenRef.current) {
        lastSeenRef.current = maxTimestamp;
      }

      return events;
    },
    refetchInterval: 5000,
    // Only poll if the user is connected AND actually has something to listen for
    enabled: !!account?.address && (platformIds.size > 0 || accountIds.size > 0),
  });
}
