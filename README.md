# Proxy Upgrade Firewall

Proxy Upgrade Firewall compares upgradeable contract implementations and flags risky changes before deployment or approval.

It supports:

- fixture-based comparisons
- Hardhat and Foundry compiler outputs
- live proxy inspection over JSON-RPC
- live current implementation vs local proposed implementation
- historical upgrade pair exploration from on-chain `Upgraded(address)` events

## Checks

- storage layout changes
- authority and upgrade-path changes
- implementation safety signals such as `delegatecall`, `selfdestruct`, and initializer locking
- ABI surface changes
- compiler and build setting changes

## Quick Start

Run the sample fixture:

```bash
node src/index.js check --fixture fixtures/corpus/uups-admin-drift --format markdown
```

Inspect a live proxy:

```bash
node src/index.js inspect \
  --proxy 0xYourProxyAddress \
  --rpc-url https://your-rpc.example
```

Compare compiler-backed inputs:

```bash
node src/index.js check \
  --current-build-info fixtures/compiler-inputs/build-info/current.build-info.json \
  --proposed-build-info fixtures/compiler-inputs/build-info/proposed.build-info.json \
  --contract contracts/TreasuryVault.sol:TreasuryVault
```

Compare a live proxy against a local proposed implementation:

```bash
node src/index.js check \
  --proxy 0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d \
  --rpc-url https://ethereum-rpc.publicnode.com \
  --proposed-build-info fixtures/real-world/governance-downgrade/build/proposed.build-info.json \
  --contract GovernedVault
```

## Evaluation

Run the regression tests:

```bash
node --test
```

Replay intentionally dangerous upgrades against verified live implementations:

```bash
node scripts/replay-live-derived-dangerous-upgrades.mjs --limit 5
```

This script derives a dangerous proposed implementation from each verified live source bundle and checks that the tool blocks it.

Explore actual historical upgrade pairs:

```bash
node scripts/explore-historical-upgrades.mjs
```

This script:

- scans live proxies with upgrade history
- resolves verified implementation pairs
- runs the analyzer on real historical upgrades
- writes CSV and JSON outputs under `reports/`

### Automated Analysis Snapshot

- sampled `100` Ethereum token contracts on `2026-03-25`
- found `16` live proxies that could be normalized into the `current vs proposed` comparison workflow
- reconstructed `27` real historical implementation pairs from `Upgraded(address)` events
- reduced the shortlist to `11` manual-review candidates after false-positive cleanup
- this is a triage pipeline, not a confirmed vulnerability list

Repository docs:

- [docs/AUTOMATED_ANALYSIS.md](docs/AUTOMATED_ANALYSIS.md)
- [docs/case-studies/usyc-pair-8.md](docs/case-studies/usyc-pair-8.md)

## Repository Layout

```text
.
├── .github/workflows/ci.yml
├── docs/
├── experiments/
├── fixtures/
├── scripts/
├── src/
│   ├── analyzers/
│   ├── cli/
│   ├── commands/
│   ├── core/
│   ├── report/
│   └── utils/
└── test/
```

## Notes

- `reports/` is ignored by git. Evaluation scripts write local outputs there.
- The historical exploration output is a review shortlist, not a confirmed vulnerability list.
