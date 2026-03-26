# Real-World Corpora

These compiler-backed scenarios model realistic upgrade reviews.

Included cases:

- `safe-storage-append`
- `governance-downgrade`
- `uups-unsafe-implementation`

Each case contains:

- `current/` and `proposed/` Solidity sources
- `build/` outputs generated with `node scripts/generate-build-info.mjs`
- a short README with the expected result
