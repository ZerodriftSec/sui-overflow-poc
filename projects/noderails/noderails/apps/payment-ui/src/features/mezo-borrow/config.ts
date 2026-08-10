/** Flip to false to disable Mezo borrow UI without deleting the feature folder. */
export const MEZO_BORROW_ENABLED = true;

export const MEZO_BORROW_CHAIN_ID = 31611;

export const MEZO_BORROWER_OPERATIONS_ADDRESS =
  '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5' as const;

export const MEZO_TROVE_MANAGER_ADDRESS =
  '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0' as const;

export const MEZO_MUSD_ADDRESS =
  '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503' as const;

export const MEZO_BORROW_EXPLORER_URL = 'https://explorer.test.mezo.org';

export const MEZO_TESTNET_RPC_URL = 'https://rpc.test.mezo.org';

/** Fallback if BorrowerOperations.minNetDebt() read fails. */
export const MEZO_MIN_NET_DEBT = 1800n * 10n ** 18n;

/** Mezo protocol minimum collateral ratio (110%). */
export const MEZO_MCR_PERCENT = 110;

/** Mezo borrow UI default collateralization (matches testnet.mezo.org/borrow). */
export const MEZO_DEFAULT_CR_PERCENT = 151;

export const MEZO_MAX_CR_PERCENT = 300;
