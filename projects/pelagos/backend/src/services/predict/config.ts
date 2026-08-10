import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const PUBLIC_SERVER = 'https://predict-server.testnet.mystenlabs.com';
const PUBLIC_PACKAGE = '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138';
const PUBLIC_PREDICT = '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a';
const DUSDC_TYPE =
  '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

export interface ManagedPredictOracle {
  oracleId: string;
  underlyingAsset: string;
  expiry: number;
  minStrike: number;
  tickSize: number;
  createdDigest: string;
  settledDigest?: string;
  compactDigest?: string;
}

export interface ManagedPredictDeployment {
  version: 1;
  mode: 'managed';
  network: 'testnet';
  deployedAt: string;
  operator: string;
  source: {
    repository: string;
    branch: string;
    commit: string;
    packagePath: string;
  };
  packageId: string;
  registryId: string;
  adminCapId: string;
  upgradeCapId: string;
  predictObjectId: string;
  oracleCapId: string;
  dusdcType: string;
  dusdcCurrencyId: string;
  liquiditySeedRaw: string;
  oracles: ManagedPredictOracle[];
  digests: Record<string, string | string[]>;
}

export const managedManifestPath = path.resolve(
  process.env.PREDICT_DEPLOYMENT_MANIFEST ??
    path.join(process.cwd(), 'config', 'predict-managed.testnet.json'),
);

let managedDeployment: ManagedPredictDeployment | null = null;

function readManagedDeployment(): ManagedPredictDeployment | null {
  if (!fs.existsSync(managedManifestPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(managedManifestPath, 'utf8')) as ManagedPredictDeployment;
  if (
    parsed.version !== 1 ||
    parsed.mode !== 'managed' ||
    parsed.network !== 'testnet' ||
    !parsed.packageId ||
    !parsed.predictObjectId ||
    !parsed.oracleCapId
  ) {
    throw new Error(`Invalid managed Predict manifest: ${managedManifestPath}`);
  }
  return parsed;
}

managedDeployment = readManagedDeployment();

export function getManagedDeployment(): ManagedPredictDeployment | null {
  return managedDeployment;
}

export function saveManagedDeployment(next: ManagedPredictDeployment): void {
  fs.mkdirSync(path.dirname(managedManifestPath), { recursive: true });
  const tmp = `${managedManifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, managedManifestPath);
  managedDeployment = next;
}

const requestedMode = process.env.PREDICT_MODE?.trim().toLowerCase();
if (requestedMode && requestedMode !== 'public' && requestedMode !== 'managed') {
  throw new Error(`PREDICT_MODE must be "public" or "managed", received ${requestedMode}`);
}
if (requestedMode === 'managed' && !managedDeployment) {
  throw new Error(`PREDICT_MODE=managed but no manifest exists at ${managedManifestPath}`);
}

const useManaged = requestedMode !== 'public' && managedDeployment !== null;

/** Active DeepBook Predict deployment. Environment overrides remain available for operations. */
export const PREDICT = {
  mode: useManaged ? 'managed' : 'public',
  network: process.env.PREDICT_NETWORK ?? 'testnet',
  rpcUrl: process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443',
  serverUrl:
    process.env.PREDICT_SERVER_URL ??
    (useManaged ? 'direct+sui://testnet' : PUBLIC_SERVER),
  packageId:
    process.env.PREDICT_PACKAGE_ID ??
    (useManaged ? managedDeployment!.packageId : PUBLIC_PACKAGE),
  predictObjectId:
    process.env.PREDICT_OBJECT_ID ??
    (useManaged ? managedDeployment!.predictObjectId : PUBLIC_PREDICT),
  dusdcType: process.env.PREDICT_DUSDC_TYPE ?? managedDeployment?.dusdcType ?? DUSDC_TYPE,
  clockId: '0x6',
  dusdcDecimals: 6,
} as const;

/** Build a fully-qualified Move call target against the current Predict package. */
export function predictTarget(
  module: string,
  fn: string,
): `${string}::${string}::${string}` {
  return `${PREDICT.packageId}::${module}::${fn}`;
}

/** Convenience snapshot of the active config (safe to expose over the API). */
export function predictConfig() {
  const managed = getManagedDeployment();
  return {
    mode: PREDICT.mode,
    network: PREDICT.network,
    rpc_url: PREDICT.rpcUrl,
    server_url: PREDICT.serverUrl,
    package_id: PREDICT.packageId,
    predict_object_id: PREDICT.predictObjectId,
    dusdc_type: PREDICT.dusdcType,
    clock_id: PREDICT.clockId,
    dusdc_decimals: PREDICT.dusdcDecimals,
    operator: useManaged ? managed?.operator ?? null : null,
    oracle_source: useManaged ? 'Deribit public market data -> Pelagos on-chain oracle' : 'Mysten public oracle',
    deployment_source: useManaged ? managed?.source ?? null : null,
  };
}
