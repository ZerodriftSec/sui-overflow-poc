'use client';

import { ListBox, Select } from '@heroui/react';

export type CheckoutSelectOption = {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
};

export function CheckoutHeroSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
}: {
  label: string;
  options: CheckoutSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const selected = options.find((option) => option.id === value);

  return (
    <Select
      className="w-full"
      fullWidth
      selectedKey={value ?? undefined}
      onSelectionChange={(key) => onChange(String(key))}
      placeholder={placeholder}
    >
      <span className="checkout-field-label">{label}</span>
      <Select.Trigger className="checkout-select-trigger">
        <Select.Value>
          {selected ? (
            <span className="checkout-select-value flex items-center gap-3">
              {selected.icon && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100 [&_div]:h-5 [&_div]:w-5 [&_div]:text-[9px] [&_img]:h-5 [&_img]:w-5">
                  {selected.icon}
                </span>
              )}
              <span className="truncate">{selected.label}</span>
            </span>
          ) : null}
        </Select.Value>
        <Select.Indicator className="text-indigo-500" />
      </Select.Trigger>
      <Select.Popover className="checkout-select-popover">
        <ListBox className="max-h-60 p-1">
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
              className="checkout-select-item rounded-lg px-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-3">
                {option.icon && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-100 [&_div]:h-5 [&_div]:w-5 [&_div]:text-[9px] [&_img]:h-5 [&_img]:w-5">
                    {option.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{option.label}</span>
                  {option.sublabel && (
                    <span className="block truncate text-xs font-medium text-slate-500">
                      {option.sublabel}
                    </span>
                  )}
                </span>
              </span>
              <ListBox.ItemIndicator className="text-indigo-600" />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
