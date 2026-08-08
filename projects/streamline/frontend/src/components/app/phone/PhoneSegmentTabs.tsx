"use client";

type PhoneSegmentTabsProps<T extends string> = {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
};

export function PhoneSegmentTabs<T extends string>({
  tabs,
  active,
  onChange,
}: PhoneSegmentTabsProps<T>) {
  return (
    <div className="flex rounded-xl bg-black/[0.04] p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-lg px-2 py-2 text-[10px] font-medium tracking-wide transition-all ${
              isActive
                ? "bg-white text-[#111] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "text-[#888] hover:text-[#555]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
