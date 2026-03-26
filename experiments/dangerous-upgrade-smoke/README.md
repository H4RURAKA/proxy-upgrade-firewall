# Dangerous Upgrade Smoke

This experiment is a small compiler-backed upgrade pair with an intentionally dangerous proposed implementation.

## Current

- role-based guards on `pause`, `setValue`, and `_authorizeUpgrade`
- explicit `grantRole` and `revokeRole`
- stable storage order

## Proposed

- inserts `emergencyAdmin` before existing storage
- weakens `_authorizeUpgrade` from role-based to `onlyOwner`
- weakens `pause` and `setValue` from role-based to `onlyOwner`
- adds `transferOwnership`
- adds unguarded `emergencySweep`
- adds `delegatecall` through `forward`

## Generate Build Info

```bash
node experiments/dangerous-upgrade-smoke/build/generate-build-info.mjs \
  experiments/dangerous-upgrade-smoke/current/SimpleVault.sol \
  experiments/dangerous-upgrade-smoke/build/current.build-info.json

node experiments/dangerous-upgrade-smoke/build/generate-build-info.mjs \
  experiments/dangerous-upgrade-smoke/proposed/SimpleVault.sol \
  experiments/dangerous-upgrade-smoke/build/proposed.build-info.json
```

## Run

```bash
node src/index.js check \
  --current-build-info experiments/dangerous-upgrade-smoke/build/current.build-info.json \
  --proposed-build-info experiments/dangerous-upgrade-smoke/build/proposed.build-info.json \
  --contract SimpleVault
```
