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

### Public Evaluation Artifacts

Checked-in evaluation snapshots live under [docs/evaluation/README.md](docs/evaluation/README.md).

- `2026-03-25` top100 snapshot:
  - `16` ready live proxies
  - `27` historical implementation pairs analyzed
  - `11` suspicious pairs after heuristic cleanup
- `2026-03-26` top300 snapshot:
  - `56` ready live proxies
  - `50` historical implementation pairs analyzed
  - `19` suspicious pairs
- The suspicious-pair rate stayed in the same range when the sample expanded from `100` to `300`, which is a useful sign that the analyzer is not obviously overfit to the smaller sample.
- The bigger limitation is still coverage, not ranking: most contracts in the top300 sample could not be reconstructed into the full workflow because they did not expose a recoverable live implementation path or lacked a verified implementation bundle.
- These artifacts are triage evidence, not confirmed vulnerability reports.

Repository docs:

- [docs/README.md](docs/README.md)
- [docs/evaluation/README.md](docs/evaluation/README.md)
- [docs/case-studies/README.md](docs/case-studies/README.md)
- [docs/project/ARCHITECTURE.md](docs/project/ARCHITECTURE.md)

## Repository Layout

```text
.
├── .github/workflows/ci.yml
├── docs/
│   ├── case-studies/
│   ├── evaluation/
│   │   └── snapshots/
│   ├── project/
│   └── README.md
├── experiments/
├── fixtures/
├── reports/            # gitignored local outputs
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
- `docs/evaluation/snapshots/` contains checked-in evaluation summaries that can be linked publicly from GitHub.
- The historical exploration output is a review shortlist, not a confirmed vulnerability list.
