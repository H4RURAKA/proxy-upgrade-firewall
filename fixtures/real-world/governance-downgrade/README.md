# Governance Downgrade

This case keeps storage safe but weakens the control plane from role-based upgrade authorization to `onlyOwner`.

Expected outcome:

- verdict: `manual-review`
- key findings: `AUTH-003`, `AUTH-005-upgradetoandcall-address-bytes`, `AUTH-007`
- no storage corruption finding

Build commands:

```bash
node scripts/generate-build-info.mjs \
  fixtures/real-world/governance-downgrade/current/GovernedVault.sol \
  fixtures/real-world/governance-downgrade/build/current.build-info.json

node scripts/generate-build-info.mjs \
  fixtures/real-world/governance-downgrade/proposed/GovernedVault.sol \
  fixtures/real-world/governance-downgrade/build/proposed.build-info.json
```
