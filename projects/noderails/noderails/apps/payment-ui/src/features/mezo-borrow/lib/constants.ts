import type { Abi } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export const BORROWER_OPERATIONS_ABI = [
  {
    name: 'minNetDebt',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBorrowingFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_debt', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'openTrove',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_debtAmount', type: 'uint256' },
      { name: '_upperHint', type: 'address' },
      { name: '_lowerHint', type: 'address' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

export const TROVE_MANAGER_ABI = [
  {
    name: 'MUSD_GAS_COMPENSATION',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'MCR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi;
