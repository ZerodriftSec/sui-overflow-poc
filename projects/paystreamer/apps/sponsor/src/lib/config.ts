import dotenv from 'dotenv';

dotenv.config();

// Network
export const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443';
export const NETWORK = process.env.NETWORK || 'devnet';
export const PORT = parseInt(process.env.PORT || '3000', 10);

// Contracts
export const PACKAGE_ID = process.env.PACKAGE_ID || '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb';
export const COIN_TYPE_REGISTRY_ID = process.env.COIN_TYPE_REGISTRY_ID || '0x076e62b38cbe903413cb7ee9a177eef0c593a9bac40d0dcdbc7d46315af65639';
export const PAYMENT_SCHEDULER_ID = process.env.PAYMENT_SCHEDULER_ID || '0x09d3b621355da923e9076fa95a8ff253331b44b8a0f4fa61b0ca51878b1d1c4e';
export const CLOCK_OBJECT_ID = process.env.CLOCK_OBJECT_ID || '0x0000000000000000000000000000000000000000000000000000000000000006';

// Sponsor
export const SPONSOR_PRIVATE_KEY = process.env.SPONSOR_PRIVATE_KEY || '';
export const SPONSOR_ADDRESS = process.env.SPONSOR_ADDRESS || '';

// Scheduler interval (10 seconds)
export const SCHEDULER_INTERVAL_MS = 10_000;
