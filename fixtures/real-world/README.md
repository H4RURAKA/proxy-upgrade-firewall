# Real-World Corpora

These compiler-backed corpora are meant to look like the kinds of upgrades an auditor or protocol reviewer would actually compare.

Included scenarios:

- `safe-storage-append`: safe storage growth with no authority downgrade
- `governance-downgrade`: role-based upgrade flow weakened into `onlyOwner`
- `uups-unsafe-implementation`: UUPS-style implementation that regresses initializer locking and introduces `selfdestruct`

Each case contains:

- `current/` and `proposed/` Solidity sources
- `build/` outputs generated with `node scripts/generate-build-info.mjs`
- `README.md` with the expected review outcome
