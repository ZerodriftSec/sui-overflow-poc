import { isValidAddress } from '@noderails/common';
import * as api from '@/lib/api';
import type { MerchantChainFamily } from '@/lib/merchant-wallet-networks';

export type MerchantWalletType = 'receiving' | 'payout';

export async function saveMerchantWalletConfig(params: {
  token: string;
  appId: string;
  appEnv: 'TEST' | 'PRODUCTION';
  walletType: MerchantWalletType;
  family: MerchantChainFamily;
  address: string;
  signature: string;
}) {
  const { token, appId, appEnv, walletType, family, address, signature } = params;

  if (walletType === 'receiving') {
    if (family === 'EVM') {
      return api.updateApp(token, appId, {
        receivingWallet: address,
        receivingWalletSignature: signature,
      });
    }

    const chainsAvail = await api.getAvailableChains(token, appEnv);
    const chainType = family === 'SOLANA' ? 'SOLANA' : 'SUI';
    const chain = chainsAvail.find((c: { chainType?: string }) => c.chainType === chainType);

    if (chain) {
      const chainId = String(chain.chainId);
      await api.enableAppChain(token, appId, chainId);
      await api.updateAppChainSettlement(token, appId, chainId, address);
    }

    const fresh = await api.getApp(token, appId);
    const recv = fresh.receivingWallet as string | null;
    const isEvmDefault = Boolean(recv && isValidAddress(recv));
    if (!recv || !isEvmDefault) {
      return api.updateApp(token, appId, {
        receivingWallet: address,
        receivingWalletSignature: signature,
      });
    }
    return fresh;
  }

  return api.updateApp(token, appId, { payoutWallet: address });
}
