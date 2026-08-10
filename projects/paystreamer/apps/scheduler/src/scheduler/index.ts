import { discoverPlatforms, discoverSubscriptions, getCurrentTime, filterDueSubscriptions } from './discovery.js';
import { processDuePayments } from './payment.js';

let isRunning = false;
let interval: any = null;

export async function runCycle() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    console.log('[Scheduler] Starting cycle...');
    const now = await getCurrentTime();
    
    const platforms = await discoverPlatforms();
    for (const p of platforms) {
      const subs = await discoverSubscriptions(p.platformId);
      const due = filterDueSubscriptions(subs, now);
      
      if (due.length > 0) {
        console.log(`[Scheduler] Found ${due.length} due payments for ${p.platformId}`);
        await processDuePayments(due);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error in cycle:', err);
  } finally {
    isRunning = false;
  }
}

export function start(intervalMs = 15000) {
  console.log(`[Scheduler] Starting loop (${intervalMs}ms)...`);
  runCycle();
  interval = setInterval(runCycle, intervalMs);
}

export function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
