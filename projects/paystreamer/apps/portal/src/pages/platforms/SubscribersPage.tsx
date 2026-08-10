import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PlatformObject } from "../../lib/platformDiscovery";
import { SubscriberTable } from "../../components/platform/SubscriberTable";
import {  querySubscriptionCreatedEventsByPlatform, queryPaymentProcessedEvents  } from "@paystreamer/sdk/core";
import { useAppConfig } from "../../hooks/useAppConfig";

export function SubscribersPage() {
    const config = useAppConfig();
  const { platform } = useOutletContext<{ platform: PlatformObject | undefined }>();

  const { data: subscriptionEvents, isPending: subEventsPending } = useQuery({
    queryKey: ["platform-subscriptions", platform?.objectId, config.network],
    queryFn: async () => {
      if (!platform?.objectId) return [];
      return await querySubscriptionCreatedEventsByPlatform(platform.objectId, config.network);
    },
    enabled: !!platform?.objectId,
  });

  const { data: paymentEvents, isPending: paymentsPending } = useQuery({
    queryKey: ["platform-payments", platform?.objectId, config.network],
    queryFn: async () => {
      if (!platform?.objectId) return [];
      return await queryPaymentProcessedEvents(undefined, platform.objectId, config.network);
    },
    enabled: !!platform?.objectId,
  });

  const isPending = subEventsPending || paymentsPending;

  if (isPending) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!platform) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>You don't own any platforms.</p>
      </div>
    );
  }

  // Aggregate data by account_id
  const subscribersMap = new Map<string, any>();

  // Process subscriptions
  subscriptionEvents?.forEach((event) => {
    const tier = platform.json.tiers?.[Number(event.tier_index)];
    subscribersMap.set(event.account_id, {
      wallet: event.account_id, // We use account_id as wallet representation for now
      tier: tier?.name || `Tier ${event.tier_index}`,
      status: "active",
      since: Number(event.timestamp) / 1000,
      totalPaid: "0",
      paymentHistory: [],
    });
  });

  // Process payments
  paymentEvents?.forEach((payment) => {
    const sub = subscribersMap.get(payment.account_id);
    if (sub) {
      sub.totalPaid = String(Number(sub.totalPaid) + Number(payment.amount));
      sub.paymentHistory.push({
        date: new Date(Number(payment.timestamp)).toLocaleDateString(),
        amount: payment.amount,
        status: "success",
      });
    }
  });

  const subscribers = Array.from(subscribersMap.values());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subscribers</h1>
        <p className="text-muted-foreground text-sm">
          Manage subscribers for {platform.json.name}
        </p>
      </div>

      <SubscriberTable platformId={platform.objectId} subscribers={subscribers} />
    </div>
  );
}