import { config } from 'dotenv';
config({ path: '../../.env' }); // Load from root

export const NETWORK = process.env.VITE_NETWORK || 'devnet';
export const SUI_RPC_URL = process.env.VITE_SUI_RPC_URL;
export const GRAPHQL_URL = process.env.VITE_GRAPHQL_URL;
export const PACKAGE_ID = process.env.VITE_PACKAGE_ID as string;
export const REGISTRY_ID = process.env.VITE_COIN_TYPE_REGISTRY_ID as string;
export const PAYMENT_SCHEDULER_ID = process.env.VITE_PAYMENT_SCHEDULER_ID as string;
export const SPONSOR_PRIVATE_KEY = process.env.SPONSOR_PRIVATE_KEY as string;
export const PUSD_TYPE_ARG = process.env.VITE_PUSD_TYPE_ARG as string;
export const CLOCK_OBJECT_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";

if (!PACKAGE_ID) throw new Error("VITE_PACKAGE_ID is not set in environment variables");
if (!PAYMENT_SCHEDULER_ID) throw new Error("VITE_PAYMENT_SCHEDULER_ID is not set in environment variables");
