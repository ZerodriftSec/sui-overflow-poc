"use client";

import { PhoneScanView } from "@/components/app/phone/PhoneScanView";
import type { StreamRequestParams } from "@/lib/request-link";

type ProScanModalProps = {
  onClose: () => void;
  onResult: (request: StreamRequestParams) => void;
};

export function ProScanModal({ onClose, onResult }: ProScanModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <p className="text-sm font-semibold text-white">Scan stream request</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[11px] font-medium text-white/50 transition-colors hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PhoneScanView
            onResult={(request) => {
              onResult(request);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
