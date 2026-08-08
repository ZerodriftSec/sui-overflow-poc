/**
 * Contract ABIs for NodeRails smart contracts.
 *
 * Only the function / event fragments we actually use are included
 * so viem can derive fully-typed calldata helpers.
 */

export const nodeRailsEscrowAbi = [
  // ── Functions ──
  {
    type: 'function',
    name: 'captureNativePayment',
    stateMutability: 'payable',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32' },
      { name: 'merchant', type: 'address' },
      { name: 'feeBps', type: 'uint16' },
      { name: 'timelocks', type: 'uint256' },
      { name: 'noderailsSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'captureERC20Payment',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32' },
      { name: 'merchant', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'payer', type: 'address' },
      { name: 'feeBps', type: 'uint16' },
      { name: 'timelocks', type: 'uint256' },
      {
        name: 'permitData',
        type: 'tuple',
        components: [
          { name: 'amount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
      { name: 'noderailsSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settlePayment',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'paymentIntentId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundPayment',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'paymentIntentId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'initiateDispute',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'paymentIntentId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'resolveDispute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32' },
      { name: 'winner', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getPayment',
    stateMutability: 'view',
    inputs: [{ name: 'paymentIntentId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'merchant', type: 'address' },
          { name: 'payer', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'feeBps', type: 'uint16' },
          { name: 'status', type: 'uint8' },
          { name: 'timelocks', type: 'uint256' },
        ],
      },
    ],
  },
  // ── Events ──
  {
    type: 'event',
    name: 'PaymentCaptured',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32', indexed: true },
      { name: 'merchant', type: 'address', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
      { name: 'timelocks', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PaymentSettled',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32', indexed: true },
      { name: 'merchant', type: 'address', indexed: true },
      { name: 'merchantAmount', type: 'uint256', indexed: false },
      { name: 'platformFee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DisputeInitiated',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'DisputeResolved',
    inputs: [
      { name: 'paymentIntentId', type: 'bytes32', indexed: true },
      { name: 'winner', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'platformFee', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const merchantManagerAbi = [
  {
    type: 'function',
    name: 'executePayout',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'payoutIntentId', type: 'bytes32' },
      { name: 'merchantWallet', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'sessionSignature', type: 'bytes' },
      { name: 'sessionExpiry', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'noderailsSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeNativePayout',
    stateMutability: 'payable',
    inputs: [
      { name: 'payoutIntentId', type: 'bytes32' },
      { name: 'merchantWallet', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'sessionSignature', type: 'bytes' },
      { name: 'sessionExpiry', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'noderailsSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isNonceUsed',
    stateMutability: 'view',
    inputs: [{ name: 'nonce', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  // ── Events ──
  {
    type: 'event',
    name: 'PayoutExecuted',
    inputs: [
      { name: 'payoutIntentId', type: 'bytes32', indexed: true },
      { name: 'merchantWallet', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'NativePayoutExecuted',
    inputs: [
      { name: 'payoutIntentId', type: 'bytes32', indexed: true },
      { name: 'merchantWallet', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
