import { SuiClient } from "@mysten/sui/client";

import { splitMilestoneAmounts, toBaseUnits } from "./amounts.js";
import {
  resolveNetworkConfig,
  type NetworkConfig,
  type NetworkName,
  type NetworkOverrides,
} from "./config.js";
import {
  resolveRecipient,
  type ResolvedRecipient,
} from "./identity.js";
import { IndexerClient, type StreamRecord } from "./indexer.js";
import type { StreamLineSigner } from "./signer.js";
import {
  buildCreateStreamV2,
  DEFAULT_DISPUTE_WINDOW_MS,
  findCreatedStreamId,
} from "./tx/create-stream.js";

export type StreamToOptions = {
  /** Total USDC to lock (human units, e.g. 100). */
  amountUsdc: number;
  /** Stream duration in days (default 14). */
  durationDays?: number;
  /** Duration in ms — overrides durationDays when set. */
  durationMs?: number;
  milestones?: Array<{ name: string; amountUsdc: number }>;
  /** Auto-yield bps on every drip (default 0 = all cash). */
  yieldBps?: number;
  disputeWindowMs?: number;
  revocable?: boolean;
};

export type StreamToResult = {
  digest: string;
  streamId: string | undefined;
  recipient: ResolvedRecipient;
};

export type StreamLineOptions = {
  network?: NetworkName;
  signer: StreamLineSigner;
  /** Optional SuiClient; created from network fullnode when omitted. */
  client?: SuiClient;
  sponsorUrl?: string;
  indexerUrl?: string;
} & NetworkOverrides;

/**
 * Narrow StreamLine client: resolve handles, create streams, read indexer.
 */
export class StreamLine {
  readonly config: NetworkConfig;
  readonly client: SuiClient;
  readonly signer: StreamLineSigner;
  readonly indexer: IndexerClient;

  readonly stream: {
    to: (to: string, opts: StreamToOptions) => Promise<StreamToResult>;
  };

  readonly streams: {
    get: (id: string) => Promise<StreamRecord>;
    list: (params?: {
      freelancer?: string;
      sender?: string;
    }) => Promise<StreamRecord[]>;
  };

  constructor(opts: StreamLineOptions) {
    this.config = resolveNetworkConfig(opts.network ?? "testnet", {
      packageId: opts.packageId,
      usdcType: opts.usdcType,
      fullnodeUrl: opts.fullnodeUrl,
      indexerUrl: opts.indexerUrl,
      suinsDomain: opts.suinsDomain,
    });
    this.client =
      opts.client ?? new SuiClient({ url: this.config.fullnodeUrl });
    this.signer = opts.signer;
    this.indexer = new IndexerClient(this.config.indexerUrl);

    this.stream = {
      to: (to, streamOpts) => this.streamTo(to, streamOpts),
    };
    this.streams = {
      get: (id) => this.indexer.get(id),
      list: (params) => this.indexer.list(params),
    };
  }

  /** Resolve a handle or hex address to a Sui address. */
  async resolve(input: string): Promise<ResolvedRecipient | null> {
    return resolveRecipient(
      this.client,
      input,
      this.config.suinsDomain
    );
  }

  private async streamTo(
    to: string,
    opts: StreamToOptions
  ): Promise<StreamToResult> {
    const recipient = await this.resolve(to);
    if (!recipient) {
      throw new Error(`Could not resolve recipient: ${to}`);
    }

    const durationMs =
      opts.durationMs ??
      Math.round((opts.durationDays ?? 14) * 86_400_000);

    let milestoneNames: string[];
    let milestoneAmountsBase: bigint[];
    let totalBase: bigint;

    if (opts.milestones && opts.milestones.length > 0) {
      milestoneNames = opts.milestones.map((m) => m.name);
      milestoneAmountsBase = opts.milestones.map((m) =>
        toBaseUnits(m.amountUsdc)
      );
      totalBase = milestoneAmountsBase.reduce((a, b) => a + b, 0n);
      const expected = toBaseUnits(opts.amountUsdc);
      if (totalBase !== expected) {
        // Prefer explicit milestone sum when they diverge slightly from amountUsdc.
        if (opts.amountUsdc <= 0) {
          /* use sum */
        } else if (totalBase === 0n) {
          totalBase = expected;
          milestoneAmountsBase = splitMilestoneAmounts(
            totalBase,
            milestoneNames.length
          );
        }
      }
    } else {
      totalBase = toBaseUnits(opts.amountUsdc);
      milestoneNames = ["Delivery"];
      milestoneAmountsBase = [totalBase];
    }

    if (totalBase <= 0n) {
      throw new Error("amountUsdc must be positive");
    }
    if (durationMs <= 0) {
      throw new Error("duration must be positive");
    }

    const tx = buildCreateStreamV2({
      packageId: this.config.packageId,
      usdcType: this.config.usdcType,
      sender: this.signer.address,
      freelancer: recipient.address,
      milestoneNames,
      milestoneAmountsBase,
      totalBase,
      durationMs,
      disputeWindowMs: opts.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS,
      revocable: opts.revocable ?? true,
      yieldBps: opts.yieldBps ?? 0,
    });

    const executed = await this.signer.signAndExecute(tx);
    const streamId = findCreatedStreamId(executed.objectChanges);

    return {
      digest: executed.digest,
      streamId,
      recipient,
    };
  }
}
