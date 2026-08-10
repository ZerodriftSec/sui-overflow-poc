import { Transaction } from "@mysten/sui/transactions";

export interface BuildCreateAccountTxParams {
  tx: Transaction;
  packageId: string;
  registryId: string;
  clockId: string;
  denomination: string; // e.g. "0x...::pusd::PUSD"
  depositAmount?: bigint; // in mist
  coinsToUse?: string[]; // object IDs of the coins to use for deposit
  isSuiDenomination?: boolean;
}

export function buildCreateAccountTx(params: BuildCreateAccountTxParams) {
  const {
    tx, packageId, registryId, clockId, denomination, depositAmount = 0n, coinsToUse = [], isSuiDenomination = false
  } = params;

  const policies = tx.moveCall({
    target: `${packageId}::account::empty_policy_set`,
  });

  const [accountObj, cap] = tx.moveCall({
    target: `${packageId}::account::create_account`,
    typeArguments: [denomination],
    arguments: [tx.object(registryId), policies, tx.object(clockId)],
  });

  if (depositAmount > 0n) {
    let primaryCoin: any;
    if (isSuiDenomination) {
      const [splitCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositAmount)]);
      primaryCoin = splitCoin;
    } else {
      if (coinsToUse.length === 0) {
        throw new Error("coinsToUse must be provided for non-SUI deposits");
      }
      const coinObjs = coinsToUse.map(id => tx.object(id));
      if (coinObjs.length > 1) {
         tx.mergeCoins(coinObjs[0], coinObjs.slice(1));
      }
      const [splitCoin] = tx.splitCoins(coinObjs[0], [tx.pure.u64(depositAmount)]);
      primaryCoin = splitCoin;
    }
    
    tx.moveCall({
      target: `${packageId}::account::deposit`,
      typeArguments: [denomination],
      arguments: [cap, accountObj, primaryCoin, tx.object(clockId)],
    });
  }

  tx.moveCall({
    target: `${packageId}::account::share_account`,
    typeArguments: [denomination],
    arguments: [accountObj, cap],
  });

  return { accountObj, cap };
}

export interface BuildDepositTxParams {
  tx: Transaction;
  packageId: string;
  clockId: string;
  denomination: string;
  accountId: string;
  capId: string;
  depositAmount: bigint;
  coinsToUse: string[];
}

export function buildDepositTx(params: BuildDepositTxParams) {
  const { tx, packageId, clockId, denomination, accountId, capId, depositAmount, coinsToUse } = params;

  if (coinsToUse.length === 0) {
    throw new Error("coinsToUse must be provided for deposit");
  }

  const coinObjs = coinsToUse.map(id => tx.object(id));
  if (coinObjs.length > 1) {
     tx.mergeCoins(coinObjs[0], coinObjs.slice(1));
  }
  const [splitCoin] = tx.splitCoins(coinObjs[0], [tx.pure.u64(depositAmount)]);
  
  tx.moveCall({
    target: `${packageId}::account::deposit`,
    typeArguments: [denomination],
    arguments: [
      tx.object(capId),
      tx.object(accountId),
      splitCoin,
      tx.object(clockId)
    ],
  });
}

export interface BuildWithdrawTxParams {
  tx: Transaction;
  packageId: string;
  denomination: string;
  accountId: string;
  capId: string;
  withdrawAmount: bigint;
  recipientAddress: string;
}

export function buildWithdrawTx(params: BuildWithdrawTxParams) {
  const { tx, packageId, denomination, accountId, capId, withdrawAmount, recipientAddress } = params;

  const [withdrawnCoin] = tx.moveCall({
    target: `${packageId}::account::withdraw`,
    typeArguments: [denomination],
    arguments: [
      tx.object(capId),
      tx.object(accountId),
      tx.pure.u64(withdrawAmount)
    ],
  });

  tx.transferObjects([withdrawnCoin], tx.pure.address(recipientAddress));
}

export interface BuildSubscribeTxParams {
  tx: Transaction;
  packageId: string;
  registryId: string;
  clockId: string;
  denomination: string;
  platformId: string;
  tierIndex: number | bigint;
  tierAmount: bigint;
  tierFrequencyMs: bigint;
  maxAttempts?: number;
  
  // Optional account details (if user already has an account)
  accountId?: string;
  accountCapId?: string;

  // Optional deposit details
  depositAmount?: bigint;
  coinsToUse?: string[];
}

export function buildSubscribeTx(params: BuildSubscribeTxParams) {
  const {
    tx, packageId, registryId, clockId, denomination, platformId, tierIndex, tierAmount, tierFrequencyMs,
    maxAttempts = 3, accountId, accountCapId, depositAmount = 0n, coinsToUse = []
  } = params;

  let workingAccountObj: any;
  let workingCap: any;
  const hasAccount = !!accountId && !!accountCapId;

  if (!hasAccount) {
    const policies = tx.moveCall({
      target: `${packageId}::account::empty_policy_set`,
    });

    const [newAccountObj, newCap] = tx.moveCall({
      target: `${packageId}::account::create_account`,
      typeArguments: [denomination],
      arguments: [
        tx.object(registryId),
        policies,
        tx.object(clockId),
      ],
    });
    workingAccountObj = newAccountObj;
    workingCap = newCap;
  } else {
    workingAccountObj = tx.object(accountId!);
    workingCap = tx.object(accountCapId!);
  }

  if (depositAmount > 0n && coinsToUse.length > 0) {
    const coinObjs = coinsToUse.map(id => tx.object(id));
    if (coinObjs.length > 1) {
       tx.mergeCoins(coinObjs[0], coinObjs.slice(1));
    }
    const [splitCoin] = tx.splitCoins(coinObjs[0], [tx.pure.u64(depositAmount)]);
    
    tx.moveCall({
      target: `${packageId}::account::deposit`,
      typeArguments: [denomination],
      arguments: [workingCap, workingAccountObj, splitCoin, tx.object(clockId)],
    });
  }

  tx.moveCall({
    target: `${packageId}::billing::create_subscription`,
    typeArguments: [denomination],
    arguments: [
      workingCap,
      workingAccountObj,
      tx.pure.id(platformId),
      tx.pure.u64(BigInt(tierIndex)),
      tx.pure.u64(tierAmount),
      tx.pure.u64(tierFrequencyMs),
      tx.pure.u8(maxAttempts),
      tx.object(clockId),
    ],
  });

  if (!hasAccount) {
    tx.moveCall({
      target: `${packageId}::account::share_account`,
      typeArguments: [denomination],
      arguments: [workingAccountObj, workingCap],
    });
  }
}

export interface BuildManageSubscriptionTxParams {
  tx: Transaction;
  packageId: string;
  clockId: string;
  denomination: string;
  accountId: string;
  capId: string;
  platformId: string;
}

export function buildPauseSubscriptionTx(params: BuildManageSubscriptionTxParams) {
  const { tx, packageId, clockId, denomination, accountId, capId, platformId } = params;
  tx.moveCall({
    target: `${packageId}::billing::pause_subscription`,
    typeArguments: [denomination],
    arguments: [
      tx.object(capId),
      tx.object(accountId),
      tx.pure.id(platformId),
      tx.object(clockId),
    ],
  });
}

export function buildResumeSubscriptionTx(params: BuildManageSubscriptionTxParams) {
  const { tx, packageId, clockId, denomination, accountId, capId, platformId } = params;
  tx.moveCall({
    target: `${packageId}::billing::resume_subscription`,
    typeArguments: [denomination],
    arguments: [
      tx.object(capId),
      tx.object(accountId),
      tx.pure.id(platformId),
      tx.object(clockId),
    ],
  });
}

export function buildCancelSubscriptionTx(params: BuildManageSubscriptionTxParams) {
  const { tx, packageId, clockId, denomination, accountId, capId, platformId } = params;
  tx.moveCall({
    target: `${packageId}::billing::cancel_subscription`,
    typeArguments: [denomination],
    arguments: [
      tx.object(capId),
      tx.object(accountId),
      tx.pure.id(platformId),
      tx.object(clockId),
    ],
  });
}

export interface BuildProcessPaymentTxParams {
  tx: Transaction;
  packageId: string;
  clockId: string;
  denomination: string;
  accountId: string;
  platformId: string;
  platformInitVersion: number;
  schedulerId: string;
  schedulerInitVersion: number;
}

export function buildProcessPaymentTx(params: BuildProcessPaymentTxParams) {
  const {
    tx, packageId, clockId, denomination, accountId, platformId, platformInitVersion, schedulerId, schedulerInitVersion
  } = params;

  const limiters = tx.moveCall({
    target: `${packageId}::policies::empty_limiters`,
    arguments: [tx.object(clockId)],
  });

  tx.moveCall({
    target: `${packageId}::policies::ensure_initialized`,
    typeArguments: [denomination],
    arguments: [tx.object(accountId), limiters, tx.object(clockId)],
  });

  tx.moveCall({
    target: `${packageId}::scheduler::process_due_payment`,
    typeArguments: [denomination],
    arguments: [
      tx.sharedObjectRef({
        objectId: schedulerId,
        initialSharedVersion: schedulerInitVersion,
        mutable: true,
      }),
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
      tx.object(accountId),
      limiters,
      tx.object(clockId),
    ],
  });
}

export interface BuildRegisterPlatformTxParams {
  tx: Transaction;
  packageId: string;
  clockId: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

export function buildRegisterPlatformTx(params: BuildRegisterPlatformTxParams) {
  const { tx, packageId, clockId, name, description, category, iconUrl } = params;
  tx.moveCall({
    target: `${packageId}::platform::register_platform`,
    arguments: [
      tx.pure.string(name),
      tx.pure.string(description),
      tx.pure.string(category),
      tx.pure.option("string", iconUrl || null),
      tx.object(clockId),
    ],
  });
}

export interface BuildManageTierTxParams {
  tx: Transaction;
  packageId: string;
  platformId: string;
  platformInitVersion: number;
}

export interface BuildCreateTierTxParams extends BuildManageTierTxParams {
  name: string;
  amount: bigint | number;
  frequencySeconds: bigint | number;
  pusdTypeArg: string;
}

export function buildCreateTierTx(params: BuildCreateTierTxParams) {
  const { tx, packageId, platformId, platformInitVersion, name, amount, frequencySeconds, pusdTypeArg } = params;
  const denominationTypeName = tx.moveCall({
    target: "0x1::type_name::get",
    typeArguments: [pusdTypeArg],
    arguments: [],
  });

  tx.moveCall({
    target: `${packageId}::platform::create_tier`,
    arguments: [
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
      tx.pure.string(name),
      tx.pure.u64(amount),
      tx.pure.u64(frequencySeconds),
      denominationTypeName,
    ],
  });
}

export interface BuildDeactivateTierTxParams extends BuildManageTierTxParams {
  tierIndex: number | bigint;
}

export function buildDeactivateTierTx(params: BuildDeactivateTierTxParams) {
  const { tx, packageId, platformId, platformInitVersion, tierIndex } = params;
  tx.moveCall({
    target: `${packageId}::platform::deactivate_tier_by_index`,
    arguments: [
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
      tx.pure.u64(tierIndex),
    ],
  });
}

export interface BuildManageTreasuryTxParams extends BuildManageTierTxParams {
  clockId: string;
}

export interface BuildProposeTreasuryChangeTxParams extends BuildManageTreasuryTxParams {
  newTreasury: string;
}

export function buildProposeTreasuryChangeTx(params: BuildProposeTreasuryChangeTxParams) {
  const { tx, packageId, clockId, platformId, platformInitVersion, newTreasury } = params;
  tx.moveCall({
    target: `${packageId}::platform::propose_treasury_change`,
    arguments: [
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
      tx.pure.address(newTreasury),
      tx.object(clockId),
    ],
  });
}

export function buildAcceptTreasuryChangeTx(params: BuildManageTreasuryTxParams) {
  const { tx, packageId, clockId, platformId, platformInitVersion } = params;
  tx.moveCall({
    target: `${packageId}::platform::accept_treasury_change`,
    arguments: [
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
      tx.object(clockId),
    ],
  });
}

export function buildCancelTreasuryChangeTx(params: BuildManageTierTxParams) {
  const { tx, packageId, platformId, platformInitVersion } = params;
  tx.moveCall({
    target: `${packageId}::platform::cancel_treasury_change`,
    arguments: [
      tx.sharedObjectRef({
        objectId: platformId,
        initialSharedVersion: platformInitVersion,
        mutable: true,
      }),
    ],
  });
}
