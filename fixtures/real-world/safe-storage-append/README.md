# Safe Storage Append

This case models a low-risk upgrade that only appends an internal storage variable at the end of the slot map.

Expected outcome:

- verdict: `allow-with-review`
- key finding: `STORAGE-002`
- no authority downgrade

Build commands:

```bash
node scripts/generate-build-info.mjs \
  fixtures/real-world/safe-storage-append/current/SafeTreasuryVault.sol \
  fixtures/real-world/safe-storage-append/build/current.build-info.json

node scripts/generate-build-info.mjs \
  fixtures/real-world/safe-storage-append/proposed/SafeTreasuryVault.sol \
  fixtures/real-world/safe-storage-append/build/proposed.build-info.json
```
