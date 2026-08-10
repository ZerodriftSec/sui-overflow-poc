import { useOutletContext } from "react-router-dom";
import { TreasuryManager } from "../../components/platform/TreasuryManager";
import { PlatformObject } from "../../lib/platformDiscovery";

export function TreasuryPage() {
  const { platform } = useOutletContext<{ platform: PlatformObject | undefined }>();

  if (!platform) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>You don't own any platforms.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Treasury</h1>
        <p className="text-muted-foreground text-sm">
          Manage treasury settings for {platform.json.name}
        </p>
      </div>

      <TreasuryManager
        platformId={platform.objectId}
        initialSharedVersion={platform.initialSharedVersion}
        currentTreasury={platform.json.treasury}
        pendingTreasury={platform.json.pending_treasury}
        pendingTreasuryChangeTime={platform.json.pending_treasury_change_time}
      />
    </div>
  );
}