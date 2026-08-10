type ScanIconButtonProps = {
  pro?: boolean;
  onClick?: () => void;
};

export function ScanIconButton({ pro = false, onClick }: ScanIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-demo-action="scan"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
        pro
          ? "border-white/15 bg-white/8 text-white/70 hover:bg-white/12"
          : "border-black/8 bg-white/70 text-[#333] hover:bg-white/90"
      }`}
      aria-label="Scan QR code"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </svg>
    </button>
  );
}

export function ProfileIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function profileIconButtonClass(pro = false) {
  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
    pro
      ? "border-white/15 bg-white/8 text-white/70 hover:bg-white/12"
      : "border-black/8 bg-white/70 text-[#333] hover:bg-white/90"
  }`;
}
