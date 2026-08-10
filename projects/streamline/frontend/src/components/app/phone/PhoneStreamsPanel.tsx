"use client";

import { FreelancerDashboard } from "../FreelancerDashboard";
import { ClientDashboard } from "../ClientDashboard";

export function PhoneStreamsPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mt-4 min-h-0 flex-1">
        <div className="space-y-6">
          <FreelancerDashboard />
          <ClientDashboard />
        </div>
      </div>
    </div>
  );
}
