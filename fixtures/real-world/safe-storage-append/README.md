# Safe Storage Append

This case models a low-risk upgrade that appends storage at the end of the existing layout.

## Expected Result

- verdict: `allow-with-review`
- key finding: `STORAGE-002`
- no authority downgrade

## Generate Build Info

```bash
node scripts/generate-build-info.mjs \
  fixtures/real-world/safe-storage-append/current/SafeTreasuryVault.sol \
  fixtures/real-world/safe-storage-append/build/current.build-info.json

node scripts/generate-build-info.mjs \
  fixtures/real-world/safe-storage-append/proposed/SafeTreasuryVault.sol \
  fixtures/real-world/safe-storage-append/build/proposed.build-info.json
```
