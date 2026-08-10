import { redirect } from "next/navigation";

// The app picker was retired — /app must not be reachable. Any hit forwards
// straight into the main workspace so nobody lands on the launcher.
export default function AppRootPage() {
  redirect("/app/user");
}
