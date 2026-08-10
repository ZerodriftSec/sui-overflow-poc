import {
  getAggregatorUrl,
  getPublisherUrl,
  getWalrusServicesForNetwork,
  WALRUS_SERVICES,
  type WalrusNetwork,
  type WalrusService,
} from "./constants";

const DEFAULT_WALRUS_FETCH_TIMEOUT_MS = 30_000;

type WalrusEndpoint = "aggregator" | "publisher";

interface WalrusEndpointRequest {
  endpoint: WalrusEndpoint;
  path: string;
  init?: RequestInit;
  timeoutMs?: number;
  service?: WalrusService;
  services?: WalrusService[];
  network?: WalrusNetwork;
}

interface WalrusEndpointResponse {
  response: Response;
  service: WalrusService;
}

interface WalrusAttemptFailure {
  serviceId: string;
  serviceName: string;
  reason: string;
}

/** Blob is missing on Walrus — typically expired storage, not a hard failure. */
export class WalrusBlobNotFoundError extends Error {
  readonly blobPath: string;

  constructor(blobPath: string) {
    super(`Walrus blob not found (expired or never stored): ${blobPath}`);
    this.name = "WalrusBlobNotFoundError";
    this.blobPath = blobPath;
  }
}

export function isWalrusBlobNotFoundError(error: unknown): boolean {
  if (error instanceof WalrusBlobNotFoundError) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.name === "WalrusBlobNotFoundError" ||
    error.message.includes("BLOB_NOT_FOUND")
  );
}

function isBlobNotFoundReason(reason: string): boolean {
  return reason.includes("BLOB_NOT_FOUND");
}

function resolveServices(options: {
  service?: WalrusService;
  services?: WalrusService[];
  network?: WalrusNetwork;
}): WalrusService[] {
  if (options.service) {
    return [options.service];
  }

  if (options.services && options.services.length > 0) {
    return options.services;
  }

  if (options.network) {
    const fromNetwork = getWalrusServicesForNetwork(options.network);
    if (fromNetwork.length > 0) {
      return fromNetwork;
    }
  }

  return WALRUS_SERVICES;
}

function buildEndpointUrl(endpoint: WalrusEndpoint, path: string, service: WalrusService): string {
  return endpoint === "aggregator"
    ? getAggregatorUrl(path, service)
    : getPublisherUrl(path, service);
}

function toReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function describePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildFailoverError(
  endpoint: WalrusEndpoint,
  path: string,
  failures: WalrusAttemptFailure[],
): Error {
  const describedPath = describePath(path);

  if (
    failures.length > 0 &&
    failures.every((failure) => isBlobNotFoundReason(failure.reason))
  ) {
    return new WalrusBlobNotFoundError(describedPath);
  }

  const endpointLabel = endpoint === "aggregator" ? "aggregator" : "publisher";
  const attempts = failures
    .map((failure) => `${failure.serviceId} (${failure.serviceName}): ${failure.reason}`)
    .join("; ");
  return new Error(
    `Walrus ${endpointLabel} request failed for ${describedPath} after trying ${failures.length} provider(s). ${attempts}`,
  );
}

export async function fetchWalrusEndpointWithFailover(
  request: WalrusEndpointRequest,
): Promise<WalrusEndpointResponse> {
  const services = resolveServices({
    service: request.service,
    services: request.services,
    network: request.network,
  });
  const failures: WalrusAttemptFailure[] = [];
  const timeoutMs = request.timeoutMs ?? DEFAULT_WALRUS_FETCH_TIMEOUT_MS;

  for (const service of services) {
    const url = buildEndpointUrl(request.endpoint, request.path, service);
    try {
      const response = await fetchWithTimeout(url, request.init ?? {}, timeoutMs);
      if (!response.ok) {
        const errorText = await response.text();
        failures.push({
          serviceId: service.id,
          serviceName: service.name,
          reason: `HTTP ${response.status}${errorText ? `: ${errorText}` : ""}`,
        });
        continue;
      }

      return { response, service };
    } catch (error) {
      failures.push({
        serviceId: service.id,
        serviceName: service.name,
        reason: toReason(error),
      });
    }
  }

  throw buildFailoverError(request.endpoint, request.path, failures);
}

export async function fetchWalrusBlobText(input: {
  blobId: string;
  network?: WalrusNetwork;
  service?: WalrusService;
  services?: WalrusService[];
  timeoutMs?: number;
}): Promise<string> {
  const { response } = await fetchWalrusEndpointWithFailover({
    endpoint: "aggregator",
    path: `/v1/blobs/${input.blobId}`,
    network: input.network,
    service: input.service,
    services: input.services,
    timeoutMs: input.timeoutMs,
  });

  return response.text();
}

export async function fetchWalrusBlobBytes(input: {
  blobId: string;
  network?: WalrusNetwork;
  service?: WalrusService;
  services?: WalrusService[];
  timeoutMs?: number;
}): Promise<Uint8Array> {
  const { response } = await fetchWalrusEndpointWithFailover({
    endpoint: "aggregator",
    path: `/v1/blobs/${input.blobId}`,
    network: input.network,
    service: input.service,
    services: input.services,
    timeoutMs: input.timeoutMs,
  });

  return new Uint8Array(await response.arrayBuffer());
}
