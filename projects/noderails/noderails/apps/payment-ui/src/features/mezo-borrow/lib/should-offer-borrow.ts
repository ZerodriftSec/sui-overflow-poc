import { isNativeToken } from '@noderails/common';
import {
  MEZO_BORROW_CHAIN_ID,
  MEZO_BORROW_ENABLED,
} from '../config';
import type { MezoBorrowChainInfo, MezoBorrowTokenInfo } from '../types';

export function findMusdToken(
  acceptedTokens: MezoBorrowTokenInfo[],
): MezoBorrowTokenInfo | undefined {
  return acceptedTokens.find(
    (t) => t.chainId === MEZO_BORROW_CHAIN_ID && t.symbol.toUpperCase() === 'MUSD',
  );
}

export function shouldOfferMezoBorrow(params: {
  enabled?: boolean;
  isTestnet: boolean;
  selectedChain: MezoBorrowChainInfo | null | undefined;
  selectedToken: MezoBorrowTokenInfo | null | undefined;
  acceptedTokens: MezoBorrowTokenInfo[];
}): boolean {
  if (!MEZO_BORROW_ENABLED || params.enabled === false) {
    return false;
  }
  if (!params.isTestnet) {
    return false;
  }

  const { selectedChain, selectedToken, acceptedTokens } = params;
  if (!selectedChain || !selectedToken) {
    return false;
  }
  if (selectedChain.chainId !== MEZO_BORROW_CHAIN_ID) {
    return false;
  }
  if (!isNativeToken(selectedToken.contractAddress)) {
    return false;
  }

  return Boolean(findMusdToken(acceptedTokens));
}
