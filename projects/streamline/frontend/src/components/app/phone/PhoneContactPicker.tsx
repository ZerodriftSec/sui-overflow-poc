"use client";

import { useMemo } from "react";
import { useAccounts, useCurrentAccount } from "@mysten/dapp-kit";

import { shortAddress } from "@/lib/format";

export type PhoneContact = {
  id: string;
  name: string;
  address: string;
};

type PhoneContactPickerProps = {
  selected: string;
  onSelect: (address: string) => void;
};

export function useWalletContacts(): PhoneContact[] {
  const account = useCurrentAccount();
  const accounts = useAccounts();

  return useMemo(
    () =>
      accounts
        .filter((a) => a.address !== account?.address)
        .map((a, i) => ({
          id: a.address,
          name: a.label?.trim() || `Account ${i + 1}`,
          address: a.address,
        })),
    [accounts, account?.address]
  );
}

export function PhoneContactPicker({ selected, onSelect }: PhoneContactPickerProps) {
  const contacts = useWalletContacts();

  if (contacts.length === 0) {
    return (
      <p className="text-center text-[11px] leading-snug text-[#888]">
        No saved contacts yet — paste a @handle or address above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#777]">
        Saved contacts
      </p>
      <div className="flex flex-col gap-1.5">
        {contacts.map((contact, index) => {
          const active = selected.trim() === contact.address;
          return (
            <button
              key={contact.id}
              type="button"
              data-demo-action={`contact-${index}`}
              onClick={() => onSelect(contact.address)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition-colors backdrop-blur-sm ${
                active
                  ? "border-[#111] bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                  : "border-white/70 bg-white/60 hover:border-black/15 hover:bg-white/80"
              }`}
            >
              <p className="text-[12px] font-semibold text-[#111]">{contact.name}</p>
              <p className="mt-0.5 font-mono text-[10px] tabular text-[#888]">
                {shortAddress(contact.address, 8, 6)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
