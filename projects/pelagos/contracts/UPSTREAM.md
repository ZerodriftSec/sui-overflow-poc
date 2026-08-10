# DeepBook Predict contract provenance

`contracts/predict` and `contracts/deepbook` are vendored from the official
[`MystenLabs/deepbookv3`](https://github.com/MystenLabs/deepbookv3) repository.

- Branch: `predict-testnet-4-16`
- Commit: `b63a565c6f867103553557912f87ef35574eef42`
- Commit date: 2026-07-08
- License: Apache-2.0 (copyright headers are retained in every source file)

The deployment script records the same immutable commit in the on-chain
deployment manifest. The contract sources are intentionally unmodified so the
Pelagos-operated instance remains byte-for-byte attributable to the official
testnet protocol implementation.
