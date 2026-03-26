# Governance Downgrade

This case keeps storage safe but weakens upgrade authorization from role-based control to `onlyOwner`.

## Expected Result

- verdict: `manual-review`
- key findings: `AUTH-003`, `AUTH-005-upgradetoandcall-address-bytes`, `AUTH-007`
- no storage corruption finding

## Generate Build Info

```bash
node scripts/generate-build-info.mjs \
  fixtures/real-world/governance-downgrade/current/GovernedVault.sol \
  fixtures/real-world/governance-downgrade/build/current.build-info.json

node scripts/generate-build-info.mjs \
  fixtures/real-world/governance-downgrade/proposed/GovernedVault.sol \
  fixtures/real-world/governance-downgrade/build/proposed.build-info.json
```
