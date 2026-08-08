import { start, stop } from './scheduler/index.js';

console.log('[App] PayStreamer Scheduler Starting');
start(10000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Stopping.');
  stop();
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT received. Stopping.');
  stop();
  process.exit(0);
});
