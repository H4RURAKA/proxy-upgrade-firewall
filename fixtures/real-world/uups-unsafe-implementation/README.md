# UUPS Unsafe Implementation

This case models a UUPS-style implementation that drops constructor-time initializer locking and adds a `selfdestruct` path.

Expected outcome:

- verdict: `block`
- key findings: `IMPL-002`, `IMPL-003`

Build commands:

```bash
node scripts/generate-build-info.mjs \
  fixtures/real-world/uups-unsafe-implementation/current/UUPSUnsafeVault.sol \
  fixtures/real-world/uups-unsafe-implementation/build/current.build-info.json

node scripts/generate-build-info.mjs \
  fixtures/real-world/uups-unsafe-implementation/proposed/UUPSUnsafeVault.sol \
  fixtures/real-world/uups-unsafe-implementation/build/proposed.build-info.json
```
