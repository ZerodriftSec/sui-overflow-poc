import { ActivityFeed } from "../../components/subscriptions/ActivityFeed";

export function ActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-muted-foreground">View your transaction history</p>
      </div>
      <ActivityFeed />
    </div>
  );
}
