import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "../../../");

function readPublishOutput(dir: string, file: string): any {
  console.log(`Parsing ${file} from ${dir}...`);
  const content = readFileSync(join(rootDir, dir, file), "utf8");
  return JSON.parse(content);
}

const pusdRes = readPublishOutput("move/stablecoin", "pusd_output.json");
const subRes = readPublishOutput("move/subscriptions", "sub_output.json");

let pusdPackageId = "";
let pusdTreasuryCapId = "";
let pusdTreasuryCapVersion = 0;

for (const change of pusdRes.objectChanges) {
  if (change.type === "published") {
    pusdPackageId = change.packageId;
  } else if (change.type === "created") {
    if (change.objectType.includes("::coin::TreasuryCap")) {
      pusdTreasuryCapId = change.objectId;
      pusdTreasuryCapVersion = Number(change.version);
    }
  }
}

let subPackageId = "";
let registryId = "";
let registryVersion = 0;
let schedulerId = "";
let schedulerVersion = 0;
let accessControlId = "";

for (const change of subRes.objectChanges) {
  if (change.type === "published") {
    subPackageId = change.packageId;
  } else if (change.type === "created") {
    if (change.objectType.endsWith("::registry::CoinTypeRegistry")) {
      registryId = change.objectId;
      registryVersion = Number(change.version);
    } else if (change.objectType.endsWith("::scheduler::PaymentScheduler")) {
      schedulerId = change.objectId;
      schedulerVersion = Number(change.version);
    } else if (change.objectType.endsWith("::access_control::AccessControl")) {
      accessControlId = change.objectId;
    }
  }
}

console.log("Deployed Objects:", {
  pusdPackageId,
  pusdTreasuryCapId,
  pusdTreasuryCapVersion,
  subPackageId,
  registryId,
  registryVersion,
  schedulerId,
  schedulerVersion,
  accessControlId
});

if (!pusdPackageId || !subPackageId) {
    throw new Error("Failed to extract package IDs from publish output.");
}

// Write to src/constants.ts
const constantsPath = join(rootDir, "packages/sdk/src/constants.ts");
let src = readFileSync(constantsPath, "utf8");

const targetNetwork = process.env.VITE_NETWORK || "local";
console.log(`Targeting network config block: ${targetNetwork}`);

// We only want to replace the target configuration inside NETWORK_CONFIGS
const targetConfigRegex = new RegExp(`(${targetNetwork}:\\s*\\{[^}]+\\})`);
const match = src.match(targetConfigRegex);

if (match) {
    let targetBlock = match[1];
    targetBlock = targetBlock.replace(/PACKAGE_ID: "[^"]*"/, `PACKAGE_ID: "${subPackageId}"`);
    targetBlock = targetBlock.replace(/COIN_TYPE_REGISTRY_ID: "[^"]*"/, `COIN_TYPE_REGISTRY_ID: "${registryId}"`);
    targetBlock = targetBlock.replace(/COIN_TYPE_REGISTRY_INIT_VERSION: \d+/, `COIN_TYPE_REGISTRY_INIT_VERSION: ${registryVersion}`);
    targetBlock = targetBlock.replace(/PAYMENT_SCHEDULER_ID: "[^"]*"/, `PAYMENT_SCHEDULER_ID: "${schedulerId}"`);
    targetBlock = targetBlock.replace(/PAYMENT_SCHEDULER_INIT_VERSION: \d+/, `PAYMENT_SCHEDULER_INIT_VERSION: ${schedulerVersion}`);
    targetBlock = targetBlock.replace(/ACCESS_CONTROL_ID: "[^"]*"/, `ACCESS_CONTROL_ID: "${accessControlId}"`);
    targetBlock = targetBlock.replace(/PUSD_PACKAGE_ID: "[^"]*"/g, `PUSD_PACKAGE_ID: "${pusdPackageId}"`);
    targetBlock = targetBlock.replace(/PUSD_TYPE_ARG: "[^"]*"/g, `PUSD_TYPE_ARG: "${pusdPackageId}::pusd::PUSD"`);
    targetBlock = targetBlock.replace(/PUSD_TREASURY_CAP_ID: "[^"]*"/, `PUSD_TREASURY_CAP_ID: "${pusdTreasuryCapId}"`);
    targetBlock = targetBlock.replace(/PUSD_TREASURY_CAP_INIT_VERSION: \d+/, `PUSD_TREASURY_CAP_INIT_VERSION: ${pusdTreasuryCapVersion}`);
    
    src = src.replace(targetConfigRegex, targetBlock);
    writeFileSync(constantsPath, src, "utf8");
    console.log(`Updated src/constants.ts with fresh ${targetNetwork} deployment.`);
} else {
    throw new Error(`Could not find ${targetNetwork} configuration block in src/constants.ts`);
}
