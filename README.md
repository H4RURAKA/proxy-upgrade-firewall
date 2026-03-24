# Proxy Upgrade Firewall

Proxy Upgrade Firewall is a GitHub-native approval engine for upgradeable smart contracts.

The point is not to build yet another storage layout checker. The point is to answer the question reviewers actually care about:

- Did the storage layout stay safe?
- Did the upgrade authority get weaker?
- Did the governance path lose delay or multisig protection?
- Did the implementation introduce dangerous upgrade patterns?
- Should this change be blocked, manually reviewed, or escalated to dynamic testing?

## Why this repo is interesting

Existing tools already cover slices of this problem:

- OpenZeppelin Upgrades validates upgrade safety and storage compatibility.
- Slither covers upgradeability and static analysis checks.
- Diffusc covers differential fuzzing for upgrade reviews.
- Seatbelt-style systems cover governance proposal simulation and reporting.

This project aims at the gap between them:

- semantic authority diffing
- governance-path downgrade detection
- risk-triggered follow-up guidance
- reviewer-friendly Markdown and JSON reports for PRs

## Current scope

This scaffold ships with:

- a zero-dependency Node CLI
- analyzers for storage, authority, and implementation safety
- a sample high-risk UUPS fixture
- Markdown and JSON report output
- a smoke test and GitHub Actions workflow

## Quick start

```bash
node src/index.js check --fixture fixtures/corpus/uups-admin-drift --format markdown
```

Write a report to disk:

```bash
node src/index.js check \
  --fixture fixtures/corpus/uups-admin-drift \
  --format markdown \
  --output reports/uups-admin-drift.md
```

Use strict mode to fail CI on high-severity findings:

```bash
node src/index.js check --fixture fixtures/corpus/uups-admin-drift --strict
```

## Folder structure

```text
.
├── .github/workflows/ci.yml
├── docs/
├── fixtures/
├── src/
│   ├── analyzers/
│   ├── cli/
│   ├── commands/
│   ├── core/
│   ├── report/
│   └── utils/
└── test/
```

## What makes this different later

The next milestone is where the real differentiation begins:

1. Read live on-chain context from a proxy address.
2. Diff authority semantics, not just source text.
3. Trigger fork simulation or Diffusc only when the risk warrants it.
4. Publish reviewer-ready artifacts directly into GitHub PRs.

Those are the parts that make this feel like an auditor's approval workflow rather than a one-off script.
