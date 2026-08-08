import { useState, useEffect } from "react";
import { Button } from "@paystreamer/sdk";
import { Input } from "@paystreamer/sdk";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@paystreamer/sdk";
import { AlertTriangle } from "lucide-react";

export function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [notifications, setNotifications] = useState({
    payments: true,
    failures: true,
    marketing: false,
  });

  useEffect(() => {
    const saved = localStorage.getItem("paystreamer_display_name");
    if (saved) setDisplayName(saved);
    const notifs = localStorage.getItem("paystreamer_notifications");
    if (notifs) setNotifications(JSON.parse(notifs));
  }, []);

  function handleSaveName() {
    localStorage.setItem("paystreamer_display_name", displayName);
  }

  function handleSaveNotifications() {
    localStorage.setItem("paystreamer_notifications", JSON.stringify(notifications));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>How you appear in the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Enter your display name"
            value={displayName}
            onChange={(e: any) => setDisplayName(e.target.value)}
            onBlur={handleSaveName}
          />
          <p className="text-xs text-muted-foreground">
            This is stored locally in your browser
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose what updates you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifications.payments}
              onChange={(e) =>
                setNotifications((prev) => ({ ...prev, payments: e.target.checked }))
              }
              onChangeCapture={handleSaveNotifications}
              className="w-4 h-4"
            />
            <span className="text-sm">Payment confirmations</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifications.failures}
              onChange={(e) =>
                setNotifications((prev) => ({ ...prev, failures: e.target.checked }))
              }
              onChangeCapture={handleSaveNotifications}
              className="w-4 h-4"
            />
            <span className="text-sm">Payment failures and alerts</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={notifications.marketing}
              onChange={(e) =>
                setNotifications((prev) => ({ ...prev, marketing: e.target.checked }))
              }
              onChangeCapture={handleSaveNotifications}
              className="w-4 h-4"
            />
            <span className="text-sm">Product updates and news</span>
          </label>
        </CardContent>
      </Card>

      <Card className="border-red-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-500">Danger Zone</CardTitle>
          </div>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm font-medium mb-2">Close Account</p>
            <p className="text-xs text-muted-foreground mb-4">
              This will permanently close your subscription account and withdraw any remaining
              funds to your wallet. This action cannot be undone.
            </p>
            <span title="Coming soon" className="inline-block">
              <Button variant="outline" disabled>
                Close Account
              </Button>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
