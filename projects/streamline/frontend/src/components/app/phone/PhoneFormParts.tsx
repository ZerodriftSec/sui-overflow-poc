import type { ReactNode } from "react";

import type { DurationUnit } from "@/lib/stream-math";

export function PhoneField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#777]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function PhoneToggleRow({
  title,
  subtitle,
  checked,
  disabled = false,
  onChange,
  children,
  "data-demo": dataDemo,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  "data-demo"?: string;
}) {
  return (
    <div
      data-demo={dataDemo}
      className={`rounded-2xl border border-white/70 bg-white/75 backdrop-blur-md ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold text-[#111]">{title}</p>
          <p className="text-[10px] text-[#777]">{subtitle}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${
            checked ? "bg-[#111]" : "bg-black/15"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {checked && children ? (
        <div className="border-t border-black/8 px-3 pb-3 pt-2.5">{children}</div>
      ) : null}
    </div>
  );
}

export const phoneInputClass =
  "w-full rounded-2xl border border-black/15 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#5b54e6]";

export const phonePctInputClass =
  "w-14 rounded-xl border border-black/15 bg-white px-2 py-2 text-[11px] outline-none focus:border-[#5b54e6] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function PhoneDurationField({
  value,
  unit,
  onValueChange,
  onUnitChange,
  disabled = false,
}: {
  value: string;
  unit: DurationUnit;
  onValueChange: (v: string) => void;
  onUnitChange: (u: DurationUnit) => void;
  disabled?: boolean;
}) {
  return (
    <PhoneField label="Duration">
      <div className="flex gap-2">
        <input
          type="number"
          value={value}
          disabled={disabled}
          placeholder="14"
          onChange={(e) => onValueChange(e.target.value)}
          className={`min-w-0 flex-1 ${phoneInputClass}`}
        />
        <select
          value={unit}
          disabled={disabled}
          onChange={(e) => onUnitChange(e.target.value as DurationUnit)}
          className="rounded-2xl border border-black/15 bg-white px-2 text-[11px] outline-none focus:border-[#5b54e6]"
        >
          <option value="hours">hours</option>
          <option value="days">days</option>
          <option value="weeks">weeks</option>
        </select>
      </div>
    </PhoneField>
  );
}
