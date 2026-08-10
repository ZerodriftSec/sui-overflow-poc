'use client';

import { useCallback, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { findMusdToken, shouldOfferMezoBorrow } from '../lib/should-offer-borrow';
import type { MezoBorrowChainInfo, MezoBorrowTokenInfo } from '../types';

export interface MezoBorrowLayerProps {
  open: boolean;
  amountUsd: number;
  selectedChain: MezoBorrowChainInfo;
  selectedToken: MezoBorrowTokenInfo;
  acceptedTokens: MezoBorrowTokenInfo[];
  musdTokenKey: string | null;
  onClose: () => void;
  onBorrowSuccess: (musdTokenKey: string) => void;
  onDecline: () => void;
}

export interface UseMezoBorrowProceedOptions {
  enabled?: boolean;
  isTestnet: boolean;
  amountUsd: number | undefined;
  selectedChain: MezoBorrowChainInfo | null | undefined;
  selectedToken: MezoBorrowTokenInfo | null | undefined;
  acceptedTokens: MezoBorrowTokenInfo[];
  onContinueReview: (nextTokenKey?: string) => void;
}

export interface UseMezoBorrowProceedResult {
  proceed: () => void;
  layerProps: MezoBorrowLayerProps | null;
}

export function useMezoBorrowProceed(
  options: UseMezoBorrowProceedOptions,
): UseMezoBorrowProceedResult {
  const {
    enabled,
    isTestnet,
    amountUsd,
    selectedChain,
    selectedToken,
    acceptedTokens,
    onContinueReview,
  } = options;

  const [open, setOpen] = useState(false);

  const offerBorrow = useMemo(
    () =>
      shouldOfferMezoBorrow({
        enabled,
        isTestnet,
        selectedChain,
        selectedToken,
        acceptedTokens,
      }),
    [enabled, isTestnet, selectedChain, selectedToken, acceptedTokens],
  );

  const musdToken = useMemo(
    () => findMusdToken(acceptedTokens),
    [acceptedTokens],
  );

  const proceed = useCallback(() => {
    if (offerBorrow && amountUsd != null && selectedChain && selectedToken) {
      track('mezo_borrow_offer_shown', {
        chain_id: selectedChain.chainId,
        amount_usd: amountUsd,
      });
      setOpen(true);
      return;
    }
    onContinueReview();
  }, [offerBorrow, amountUsd, selectedChain, selectedToken, onContinueReview]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleBorrowSuccess = useCallback(
    (musdTokenKey: string) => {
      setOpen(false);
      track('mezo_borrow_tx_success', { musd_token_key: musdTokenKey });
      onContinueReview(musdTokenKey);
    },
    [onContinueReview],
  );

  const handleDecline = useCallback(() => {
    setOpen(false);
    track('mezo_borrow_declined');
    onContinueReview();
  }, [onContinueReview]);

  const layerProps: MezoBorrowLayerProps | null =
    open && amountUsd != null && selectedChain && selectedToken
      ? {
          open,
          amountUsd,
          selectedChain,
          selectedToken,
          acceptedTokens,
          musdTokenKey: musdToken?.tokenKey ?? null,
          onClose: handleClose,
          onBorrowSuccess: handleBorrowSuccess,
          onDecline: handleDecline,
        }
      : null;

  return { proceed, layerProps };
}
