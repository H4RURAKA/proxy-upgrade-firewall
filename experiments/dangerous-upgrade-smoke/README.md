# Dangerous Upgrade Smoke

This scenario is a small real compiler-backed upgrade test for Proxy Upgrade Firewall.

## Current contract

- role-based guards on `pause`, `setValue`, and `_authorizeUpgrade`
- explicit `grantRole` and `revokeRole`
- stable storage order

## Proposed dangerous change

- inserts `emergencyAdmin` before existing storage
- weakens `_authorizeUpgrade` from role-based to `onlyOwner`
- weakens `pause` and `setValue` from role-based to `onlyOwner`
- adds `transferOwnership`
- adds unguarded `emergencySweep`
- adds `delegatecall` through `forward`

## Build commands

```bash
node experiments/dangerous-upgrade-smoke/build/generate-build-info.mjs \
  experiments/dangerous-upgrade-smoke/current/SimpleVault.sol \
  experiments/dangerous-upgrade-smoke/build/current.build-info.json

node experiments/dangerous-upgrade-smoke/build/generate-build-info.mjs \
  experiments/dangerous-upgrade-smoke/proposed/SimpleVault.sol \
  experiments/dangerous-upgrade-smoke/build/proposed.build-info.json
```

## Review command

```bash
node src/index.js check \
  --current-build-info experiments/dangerous-upgrade-smoke/build/current.build-info.json \
  --proposed-build-info experiments/dangerous-upgrade-smoke/build/proposed.build-info.json \
  --contract SimpleVault
```

