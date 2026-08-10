import { getPhoneToasts } from "@/lib/phone-toast";

/**
 * Silent UI puppet — clicks / types / navigates real app controls.
 * Onboarding → claim @usertester → Request stream (private + milestones) → stop on share link.
 */

export type DemoNavigate =
  | {
      kind: "phone";
      route: "user" | "create" | "request" | "launcher" | "scan" | "pro";
    }
  | { kind: "user"; role: "payer" | "receiver"; tab: string };

export const DEMO_EVENT = "sl-demo-tour";
export const DEMO_NAV_EVENT = "sl-demo-navigate";
export const DEMO_PUPPET_STATUS = "sl-demo-puppet-status";
export const DEMO_REQUEST_LINK_KEY = "sl-demo-request-link";

export type DemoScenario = "request" | "scan" | "pro";

export type DemoTourEvent =
  | { type: "start"; scenario?: DemoScenario }
  | { type: "stop" };

export type PuppetStatus = {
  running: boolean;
  label: string;
};

export function emitDemoTour(detail: DemoTourEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail }));
}

export function emitDemoNavigate(nav: DemoNavigate) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_NAV_EVENT, { detail: nav }));
}

export function emitPuppetStatus(status: PuppetStatus) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_PUPPET_STATUS, { detail: status }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_HANDLE = "usertester";
const DEMO_PRO_HANDLE = "protaster";
const DEMO_MILESTONES = [
  "Start Work",
  "MidWork Checkin",
  "Final Delivery",
] as const;
const DEMO_FUND_AMOUNT = "2500";
const DEMO_REBALANCE_AMOUNT = 500;
const DEMO_WORKERS = [
  { name: "Alex Rivera", monthly: "1200" },
  { name: "Jordan Lee", monthly: "1000" },
] as const;

function qs(sel: string): HTMLElement | null {
  return document.querySelector(sel) as HTMLElement | null;
}

async function waitFor(
  sel: string,
  timeoutMs = 8000
): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = qs(sel);
    if (el) return el;
    await sleep(80);
  }
  return null;
}

async function waitForAny(
  sels: string[],
  timeoutMs = 8000
): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of sels) {
      const el = qs(sel);
      if (el) return el;
    }
    await sleep(80);
  }
  return null;
}

async function waitEnabled(
  sel: string,
  timeoutMs = 20_000
): Promise<HTMLButtonElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = qs(sel) as HTMLButtonElement | null;
    if (el && !el.disabled) return el;
    await sleep(100);
  }
  return null;
}

function flash(el: HTMLElement) {
  const prev = el.style.outline;
  const prevOff = el.style.outlineOffset;
  el.style.outline = "2px solid #5b54e6";
  el.style.outlineOffset = "3px";
  window.setTimeout(() => {
    el.style.outline = prev;
    el.style.outlineOffset = prevOff;
  }, 450);
}

export async function puppetClick(sel: string, abort: () => boolean) {
  if (abort()) return false;
  const el = await waitFor(sel);
  if (!el || abort()) return false;
  flash(el);
  await sleep(180);
  if (typeof el.click === "function") {
    el.click();
  } else {
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
  }
  await sleep(320);
  return true;
}

export async function puppetType(
  sel: string,
  value: string,
  abort: () => boolean
) {
  if (abort()) return false;
  const el = (await waitFor(sel)) as HTMLInputElement | null;
  if (!el || abort()) return false;
  flash(el);
  el.focus();
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(280);
  return true;
}

async function puppetSelect(
  sel: string,
  value: string,
  abort: () => boolean
) {
  if (abort()) return false;
  const el = (await waitFor(sel)) as HTMLSelectElement | null;
  if (!el || abort()) return false;
  flash(el);
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value"
  );
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(250);
  return true;
}

async function ensureToggleOn(demo: string, abort: () => boolean) {
  if (abort()) return;
  const switchEl = await waitFor(
    `[data-demo="${demo}"] [role="switch"]`,
    5000
  );
  if (!switchEl || abort()) return;
  if (switchEl.getAttribute("aria-checked") !== "true") {
    flash(switchEl);
    await sleep(120);
    switchEl.click();
    await sleep(350);
  }
}

async function ensureToggleOff(demo: string, abort: () => boolean) {
  if (abort()) return;
  const switchEl = await waitFor(
    `[data-demo="${demo}"] [role="switch"]`,
    5000
  );
  if (!switchEl || abort()) return;
  if (switchEl.getAttribute("aria-checked") === "true") {
    flash(switchEl);
    await sleep(120);
    switchEl.click();
    await sleep(350);
  }
}

/**
 * Wait on the claim-name screen.
 * Programmatic Claim clicks often hit "failed to open new window" (browser blocks
 * wallet popups without a real user gesture) — so we fill the name, pulse Claim,
 * and wait for a *human* Claim + approve. Skip only on reject or long timeout.
 */
async function waitHandleClaimOrSkip(
  timeoutMs: number,
  abort: () => boolean
): Promise<"ok" | "skip"> {
  const start = Date.now();
  let lastPulse = 0;
  const seenToastIds = new Set(getPhoneToasts().map((t) => t.id));

  while (Date.now() - start < timeoutMs) {
    if (abort()) return "skip";

    if (
      qs('[data-demo="home-quick"]') ||
      qs('[data-demo="pro-home"]') ||
      qs('[data-demo-action="onboard-claim-continue"]')
    ) {
      return "ok";
    }

    for (const t of getPhoneToasts()) {
      if (seenToastIds.has(t.id)) continue;
      seenToastIds.add(t.id);
      const msg = t.message;
      // Popup-blocker noise from a synthetic click — ignore, keep waiting.
      if (/open (a )?new window|popup|blocked/i.test(msg)) continue;
      // User rejected / cancelled the wallet prompt → skip name.
      if (
        t.kind === "error" &&
        /reject|denied|cancel|user.*(refus|declin)/i.test(msg)
      ) {
        return "skip";
      }
    }

    // Pulse Claim so it’s obvious what to press
    if (Date.now() - lastPulse > 2200) {
      lastPulse = Date.now();
      const claim = qs(
        '[data-demo-action="onboard-claim-name"]'
      ) as HTMLButtonElement | null;
      if (claim && !claim.disabled) flash(claim);
    }

    await sleep(150);
  }
  return "skip";
}

async function clickPreferredWallet(abort: () => boolean) {
  const preferred =
    qs('[data-demo-wallet="slush"]') ||
    qs('[data-demo-wallet="sui"]') ||
    qs('[data-demo-action="connect-wallet-0"]');
  if (!preferred || abort()) return false;
  flash(preferred);
  await sleep(180);
  preferred.click();
  await sleep(400);
  return true;
}

type StepFn = (abort: () => boolean) => Promise<void>;

/** Shared: land on consumer or Pro home (run onboarding if needed). */
function buildReachHomeSteps(app: "user" | "pro"): StepFn[] {
  const homeSel =
    app === "pro" ? '[data-demo="pro-home"]' : '[data-demo="home-quick"]';
  const handle = app === "pro" ? DEMO_PRO_HANDLE : DEMO_HANDLE;
  const route = app === "pro" ? "pro" : "user";

  return [
    async (abort) => {
      emitPuppetStatus({
        running: true,
        label: app === "pro" ? "Opening Pro…" : "Opening app…",
      });
      emitDemoNavigate({ kind: "phone", route });
      await sleep(700);
      if (abort()) return;
    },
    async (abort) => {
      const gate = await waitForAny(
        [
          '[data-demo-action="onboard-continue"]',
          '[data-demo-action="connect-sui"]',
          '[data-demo="onboard-handle"]',
          '[data-demo-action="onboard-claim-continue"]',
          '[data-demo-action="onboard-skip-name"]',
          homeSel,
        ],
        6000
      );
      if (!gate || abort()) return;
      if (qs(homeSel)) return;

      if (qs('[data-demo-action="onboard-continue"]')) {
        emitPuppetStatus({ running: true, label: "Onboarding…" });
        await puppetClick('[data-demo-action="onboard-continue"]', abort);
        await sleep(500);
        if (abort()) return;
        if (qs('[data-demo-action="onboard-continue"]')) {
          await puppetClick('[data-demo-action="onboard-continue"]', abort);
          await sleep(500);
        }
      }

      if (abort()) return;

      if (await waitFor('[data-demo-action="connect-sui"]', 3000)) {
        emitPuppetStatus({ running: true, label: "Sui wallet…" });
        await puppetClick('[data-demo-action="connect-sui"]', abort);
        await sleep(400);
        await waitForAny(
          ['[data-demo-action="connect-wallet-0"]', '[data-demo-wallet="slush"]'],
          5000
        );
        emitPuppetStatus({ running: true, label: "Approve login…" });
        await clickPreferredWallet(abort);
        await waitForAny(
          [
            '[data-demo="onboard-handle"]',
            '[data-demo-action="onboard-claim-continue"]',
            '[data-demo-action="onboard-skip-name"]',
            homeSel,
          ],
          90_000
        );
      }

      if (abort()) return;
      if (qs(homeSel)) return;

      if (qs('[data-demo-action="onboard-claim-continue"]')) {
        await puppetClick('[data-demo-action="onboard-claim-continue"]', abort);
        await waitFor(homeSel, 15_000);
        return;
      }

      if (await waitFor('[data-demo="onboard-handle"]', 4000)) {
        emitPuppetStatus({
          running: true,
          label: app === "pro" ? "Claim ProTester…" : "Claim UserTester…",
        });
        await puppetType('[data-demo="onboard-handle"]', handle, abort);
        await waitEnabled('[data-demo-action="onboard-claim-name"]', 25_000);
        if (abort()) return;
        const claimBtn = qs(
          '[data-demo-action="onboard-claim-name"]'
        ) as HTMLButtonElement | null;
        if (claimBtn) flash(claimBtn);
        emitPuppetStatus({
          running: true,
          label: "Press Claim → approve (reject → skip)",
        });
        const outcome = await waitHandleClaimOrSkip(90_000, abort);
        if (outcome === "ok") {
          if (qs('[data-demo-action="onboard-claim-continue"]')) {
            await puppetClick(
              '[data-demo-action="onboard-claim-continue"]',
              abort
            );
          }
        } else if (
          !abort() &&
          qs('[data-demo-action="onboard-skip-name"]')
        ) {
          emitPuppetStatus({ running: true, label: "Skip for now…" });
          await puppetClick('[data-demo-action="onboard-skip-name"]', abort);
        }
      } else if (qs('[data-demo-action="onboard-skip-name"]')) {
        await puppetClick('[data-demo-action="onboard-skip-name"]', abort);
      }

      await waitFor(homeSel, 20_000);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Home" });
      await waitFor(homeSel, 15_000);
      await sleep(450);
      if (abort()) return;
    },
  ];
}

/** Scenario A — public request: milestones + yield split → share link. */
export function buildRequestPuppetScript(): StepFn[] {
  return [
    ...buildReachHomeSteps("user"),
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Request stream…" });
      const clicked = await puppetClick('[data-demo-action="request"]', abort);
      if (!clicked) {
        emitDemoNavigate({ kind: "phone", route: "request" });
        await sleep(500);
      }
      await waitFor('[data-demo="request-amount"]', 6000);
      await sleep(350);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Amount…" });
      await puppetType('[data-demo="request-name"]', "Demo engagement", abort);
      await puppetType('[data-demo="request-amount"]', "800", abort);
      await puppetClick('[data-demo-action="request-continue"]', abort);
      await waitFor('[data-demo="request-private"]', 8000);
      await sleep(350);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Milestones…" });
      // Public / named stream — not private
      await ensureToggleOff("request-private", abort);
      await ensureToggleOn("request-milestones", abort);
      await sleep(300);
      while (
        !abort() &&
        document.querySelectorAll('[data-demo^="request-milestone-"]').length < 3
      ) {
        await puppetClick('[data-demo-action="request-add-milestone"]', abort);
        await sleep(200);
      }
      for (let i = 0; i < DEMO_MILESTONES.length; i++) {
        if (abort()) return;
        await puppetType(
          `[data-demo="request-milestone-${i}"]`,
          DEMO_MILESTONES[i],
          abort
        );
      }
      await puppetClick('[data-demo-action="request-continue"]', abort);
      await waitFor('[data-demo="request-splits"]', 8000);
      await sleep(350);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Yield split…" });
      await ensureToggleOn("request-splits", abort);
      await sleep(300);
      // 70% spending / 30% yield
      await puppetType('[data-demo="request-split-pct-0"]', "70", abort);
      if (!qs('[data-demo="request-split-pct-1"]')) {
        await puppetClick('[data-demo-action="request-add-split"]', abort);
        await sleep(250);
      }
      await puppetType('[data-demo="request-split-pct-1"]', "30", abort);
      const yieldBox = qs(
        '[data-demo="request-split-yield-1"]'
      ) as HTMLInputElement | null;
      if (yieldBox && !yieldBox.checked) {
        flash(yieldBox);
        yieldBox.click();
        await sleep(200);
      }
      await sleep(300);
      await puppetClick('[data-demo-action="request-create"]', abort);
      await waitFor('[data-demo="request-share"]', 10_000);
      await sleep(600);
      emitPuppetStatus({ running: false, label: "" });
      abortFlag = true;
    },
  ];
}

function demoRequestLink(): string {
  try {
    const fromEnv = process.env.NEXT_PUBLIC_DEMO_REQUEST_LINK?.trim();
    if (fromEnv) return fromEnv;
    const stored = sessionStorage.getItem(DEMO_REQUEST_LINK_KEY)?.trim();
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return "";
}

/** Wait for onramp success — pulse Buy USDC for a real click (wallet sign). */
async function waitOnrampBuy(timeoutMs: number, abort: () => boolean) {
  const start = Date.now();
  let lastPulse = 0;
  while (Date.now() - start < timeoutMs) {
    if (abort()) return false;
    if (qs('[data-demo="onramp-success"]')) return true;
    if (Date.now() - lastPulse > 2200) {
      lastPulse = Date.now();
      const btn = qs(
        '[data-demo-action="onramp-buy"]'
      ) as HTMLButtonElement | null;
      if (btn && !btn.disabled) flash(btn);
    }
    await sleep(150);
  }
  return !!qs('[data-demo="onramp-success"]');
}

/** Scenario B — Buy USDC ($500) → Scan request link → Accept & fund. */
export function buildScanPuppetScript(): StepFn[] {
  return [
    ...buildReachHomeSteps("user"),
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Buy USDC…" });
      const clicked = await puppetClick('[data-demo-action="buy"]', abort);
      if (!clicked) {
        emitPuppetStatus({ running: true, label: "Buy tile missing" });
        await sleep(1200);
        return;
      }
      await waitFor('[data-demo="onramp-spend"]', 8000);
      await sleep(300);
      await puppetType('[data-demo="onramp-spend"]', "500", abort);
      await sleep(300);
      emitPuppetStatus({
        running: true,
        label: "Press Buy USDC → approve",
      });
      const buyBtn = qs('[data-demo-action="onramp-buy"]');
      if (buyBtn) flash(buyBtn);
      await waitOnrampBuy(90_000, abort);
      if (qs('[data-demo-action="onramp-done"]')) {
        await puppetClick('[data-demo-action="onramp-done"]', abort);
        await sleep(400);
      }
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Scan request…" });
      await waitFor('[data-demo="home-quick"]', 10_000);
      const scanned = await puppetClick('[data-demo-action="scan"]', abort);
      if (!scanned) {
        emitDemoNavigate({ kind: "phone", route: "scan" });
        await sleep(500);
      }
      await waitFor('[data-demo="scan-link"]', 8000);
      const link = demoRequestLink();
      if (!link) {
        emitPuppetStatus({
          running: true,
          label: "Need request link (run ▶ first)",
        });
        await sleep(2500);
        abortFlag = true;
        return;
      }
      await puppetType('[data-demo="scan-link"]', link, abort);
      await sleep(250);
      await puppetClick('[data-demo-action="scan-use-link"]', abort);
      await waitFor('[data-demo="fulfill-review"]', 10_000);
      await sleep(500);
    },
    async (abort) => {
      emitPuppetStatus({
        running: true,
        label: "Press Accept & fund → approve",
      });
      const accept = await waitEnabled(
        '[data-demo-action="fulfill-accept"]',
        15_000
      );
      if (accept) flash(accept);
      // Wait for user to fund (or Done after success)
      const start = Date.now();
      let lastPulse = 0;
      while (Date.now() - start < 120_000) {
        if (abort()) break;
        if (qs('[data-demo-action="fulfill-done"]')) {
          await sleep(500);
          break;
        }
        if (Date.now() - lastPulse > 2200) {
          lastPulse = Date.now();
          const btn = qs('[data-demo-action="fulfill-accept"]');
          if (btn) flash(btn);
        }
        await sleep(150);
      }
      emitPuppetStatus({ running: false, label: "" });
      abortFlag = true;
    },
  ];
}

function demoPayees(): [string, string] {
  const a =
    process.env.NEXT_PUBLIC_DEMO_PAYEE?.trim() ||
    (typeof window !== "undefined"
      ? (window as unknown as { __SL_DEMO_PAYEE?: string }).__SL_DEMO_PAYEE
      : "") ||
    "";
  const b =
    process.env.NEXT_PUBLIC_DEMO_PAYEE_2?.trim() ||
    (typeof window !== "undefined"
      ? (window as unknown as { __SL_DEMO_PAYEE_2?: string }).__SL_DEMO_PAYEE_2
      : "") ||
    a;
  return [a, b];
}

async function puppetRange(
  sel: string,
  value: number,
  abort: () => boolean
) {
  if (abort()) return false;
  const el = (await waitFor(sel)) as HTMLInputElement | null;
  if (!el || abort()) return false;
  flash(el);
  const max = Number(el.max) || value;
  const next = Math.min(value, max);
  const proto = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  );
  proto?.set?.call(el, String(next));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(280);
  return true;
}

/** Wait for Fund modal to close after user approves wallet. */
async function waitFundDone(timeoutMs: number, abort: () => boolean) {
  const start = Date.now();
  let lastPulse = 0;
  while (Date.now() - start < timeoutMs) {
    if (abort()) return false;
    if (!qs('[data-demo="pro-fund-amount"]')) return true;
    if (Date.now() - lastPulse > 2200) {
      lastPulse = Date.now();
      const btn = qs('[data-demo-action="pro-fund-submit"]');
      if (btn) flash(btn);
    }
    await sleep(150);
  }
  return !qs('[data-demo="pro-fund-amount"]');
}

async function waitRebalanceDone(timeoutMs: number, abort: () => boolean) {
  const start = Date.now();
  let lastPulse = 0;
  while (Date.now() - start < timeoutMs) {
    if (abort()) return false;
    if (!qs('[data-demo="pro-rebalance-range"]')) return true;
    if (Date.now() - lastPulse > 2200) {
      lastPulse = Date.now();
      const btn = qs('[data-demo-action="pro-rebalance-submit"]');
      if (btn && !(btn as HTMLButtonElement).disabled) flash(btn);
    }
    await sleep(150);
  }
  return !qs('[data-demo="pro-rebalance-range"]');
}

async function addProWorker(
  abort: () => boolean,
  name: string,
  monthly: string,
  payee: string
) {
  await puppetClick('[data-demo-action="pro-add-person"]', abort);
  await waitFor('[data-demo="pro-worker-name"]', 8000);
  await sleep(250);
  await puppetType('[data-demo="pro-worker-name"]', name, abort);
  if (payee) {
    await puppetType('[data-demo="pro-worker-payto"]', payee, abort);
  }
  await puppetType('[data-demo="pro-worker-monthly"]', monthly, abort);
  await puppetSelect('[data-demo="pro-worker-hire-mode"]', "public", abort);
  await puppetClick('[data-demo-action="pro-worker-save"]', abort);
  await sleep(700);
}

/** Scenario C — Pro onboarding → fund treasury → 2 people → start streams. */
export function buildProPuppetScript(): StepFn[] {
  return [
    ...buildReachHomeSteps("pro"),
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Treasury…" });
      await puppetClick('[data-demo-action="pro-tab-treasury"]', abort);
      await sleep(500);
      await waitFor('[data-demo-action="pro-fund"]', 8000);
      await puppetClick('[data-demo-action="pro-fund"]', abort);
      await waitFor('[data-demo="pro-fund-amount"]', 8000);
      await sleep(300);
      await puppetType('[data-demo="pro-fund-amount"]', DEMO_FUND_AMOUNT, abort);
      await sleep(250);
      emitPuppetStatus({
        running: true,
        label: "Press Fund pool → approve",
      });
      const submit = qs('[data-demo-action="pro-fund-submit"]');
      if (submit) flash(submit);
      await waitFundDone(120_000, abort);
      await sleep(400);
      // Rebalance: Liquid → Yield, slider to $500
      emitPuppetStatus({ running: true, label: "Rebalance…" });
      await puppetClick('[data-demo-action="pro-rebalance"]', abort);
      await waitFor('[data-demo="pro-rebalance-range"]', 8000);
      await sleep(300);
      await puppetRange(
        '[data-demo="pro-rebalance-range"]',
        DEMO_REBALANCE_AMOUNT,
        abort
      );
      await sleep(250);
      emitPuppetStatus({
        running: true,
        label: "Press Rebalance → approve",
      });
      const reb = qs('[data-demo-action="pro-rebalance-submit"]');
      if (reb) flash(reb);
      await waitRebalanceDone(120_000, abort);
      await sleep(400);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "People…" });
      await puppetClick('[data-demo-action="pro-tab-people"]', abort);
      await sleep(500);
      await waitFor('[data-demo-action="pro-add-person"]', 8000);
      const [payeeA, payeeB] = demoPayees();
      if (!payeeA) {
        emitPuppetStatus({
          running: true,
          label: "Set DEMO_PAYEE for hires…",
        });
        await sleep(2000);
      }
      for (let i = 0; i < DEMO_WORKERS.length; i++) {
        if (abort()) return;
        const w = DEMO_WORKERS[i];
        emitPuppetStatus({ running: true, label: `Add ${w.name}…` });
        await addProWorker(abort, w.name, w.monthly, i === 0 ? payeeA : payeeB);
      }
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Streams → Start…" });
      await puppetClick('[data-demo-action="pro-tab-streams"]', abort);
      await sleep(600);
      const startBtn = await waitFor('[data-demo-action="pro-start"]', 8_000);
      if (startBtn) {
        emitPuppetStatus({
          running: true,
          label: "Press Start → approve",
        });
        flash(startBtn);
        const beforeCount = document.querySelectorAll(
          '[data-demo-action="pro-start"]'
        ).length;
        const t0 = Date.now();
        let lastPulse = 0;
        while (Date.now() - t0 < 90_000) {
          if (abort()) break;
          const nowCount = document.querySelectorAll(
            '[data-demo-action="pro-start"]'
          ).length;
          if (nowCount < beforeCount) break;
          if (Date.now() - lastPulse > 2200) {
            lastPulse = Date.now();
            const btn = qs('[data-demo-action="pro-start"]');
            if (btn) flash(btn);
          }
          await sleep(150);
        }
      }
      await sleep(400);
    },
    async (abort) => {
      emitPuppetStatus({ running: true, label: "Tools → POS…" });
      await puppetClick('[data-demo-action="pro-tab-tools"]', abort);
      await sleep(500);
      await waitFor('[data-demo-action="pro-tools-pos"]', 8000);
      await puppetClick('[data-demo-action="pro-tools-pos"]', abort);
      await sleep(400);
      await waitFor('[data-demo-action="pro-pos-new"]', 8000);
      await puppetClick('[data-demo-action="pro-pos-new"]', abort);
      await waitFor('[data-demo="pro-pos-label"]', 8000);
      await sleep(250);
      await puppetType('[data-demo="pro-pos-label"]', "TEST", abort);
      await sleep(250);
      await puppetClick('[data-demo-action="pro-pos-create-submit"]', abort);
      await sleep(800);
      // Detail → list → tools hub
      if (qs('[data-demo-action="pro-pos-detail-back"]')) {
        await puppetClick('[data-demo-action="pro-pos-detail-back"]', abort);
        await sleep(400);
      }
      if (qs('[data-demo-action="pro-tools-back"]')) {
        await puppetClick('[data-demo-action="pro-tools-back"]', abort);
        await sleep(400);
      }
      await waitFor('[data-demo="pro-tools-hub"]', 5000);
      await sleep(500);
      emitPuppetStatus({ running: false, label: "" });
      abortFlag = true;
    },
  ];
}

/** @deprecated use buildRequestPuppetScript */
export function buildPhonePuppetScript(): StepFn[] {
  return buildRequestPuppetScript();
}

let abortFlag = false;
let running = false;
let activeScenario: DemoScenario | null = null;

export function stopPuppet() {
  abortFlag = true;
  running = false;
  activeScenario = null;
  emitPuppetStatus({ running: false, label: "" });
}

export async function startPuppet(scenario: DemoScenario = "request") {
  if (running) return;
  running = true;
  abortFlag = false;
  activeScenario = scenario;
  const script =
    scenario === "scan"
      ? buildScanPuppetScript()
      : scenario === "pro"
        ? buildProPuppetScript()
        : buildRequestPuppetScript();
  const aborted = () => abortFlag;
  try {
    for (const step of script) {
      if (aborted()) break;
      await step(aborted);
    }
  } finally {
    running = false;
    activeScenario = null;
    if (!abortFlag) emitPuppetStatus({ running: false, label: "" });
  }
}

export function isPuppetRunning() {
  return running;
}

export function getActivePuppetScenario() {
  return activeScenario;
}
