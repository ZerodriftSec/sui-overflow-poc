import { predictFeedStatus, pushPredictOracleTick } from '../services/predict/feed';

pushPredictOracleTick()
  .then((digest) => {
    console.log(JSON.stringify({ digest, status: predictFeedStatus() }, null, 2));
    process.exit(digest ? 0 : 1);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
