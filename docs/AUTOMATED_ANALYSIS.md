# Automated Analysis Summary

This document summarizes the automated evaluation pipeline used in this repository before manual review.

## Scope

The goal was not to label 100 live contracts as vulnerable.

The goal was to:

1. find live proxy contracts that can be compared with this tool
2. recover real historical implementation pairs from on-chain upgrade events
3. rank the resulting upgrade pairs for manual review

## Dataset

- date: `2026-03-25`
- source: CoinGecko top market-cap tokens with Ethereum contract addresses
- sample size: `100`
- RPC: `https://ethereum-rpc.publicnode.com`

## Stage 1: Comparable Live Proxy Census

Script:

```bash
node scripts/census-live-comparable-proxies.mjs
```

Output:

- `reports/live-mainnet-top100-comparable.csv`
- `reports/live-mainnet-top100-comparable-summary.json`
- `reports/live-mainnet-top100-comparable-ready.csv`

Result:

- requested: `100`
- completed: `100`
- ready for live comparison: `16`
- readable implementation but not Sourcify-verified: `8`
- no readable live implementation for this mode: `76`

Interpretation:

- `ready` means the current live implementation can be resolved and normalized into the same comparison model used by `check`
- this stage measures coverage, not vulnerabilities

## Stage 2: Historical Upgrade Pair Scan

Script:

```bash
node scripts/explore-historical-upgrades.mjs
```

Output:

- `reports/historical-upgrade-pairs.csv`
- `reports/historical-upgrade-suspicious.csv`
- `reports/historical-upgrade-summary.json`

Result:

- ready live proxies scanned: `16`
- proxies with `Upgraded(address)` events: `15`
- proxies with actual implementation pairs: `10`
- analyzed historical pairs: `27`
- review candidates after false-positive reduction: `11`
- low-signal pairs: `11`
- unresolved pairs: `5`

Interpretation:

- a `candidate` is a pair that should be reviewed by a human
- a `candidate` is not a confirmed vulnerability
- `low-signal` pairs mostly reflect ABI or compiler changes without a strong authority or implementation risk signal
- `unresolved` pairs could not be compared cleanly because an old implementation was not verified or could not be reconstructed

## What Counts As High Signal

The strongest automated signals in this project are:

- `STORAGE-001`: a real storage shape change before the tail
- `AUTH-003`: weaker upgrade authorizer
- `AUTH-004`: new privileged function with no meaningful guard
- `AUTH-005`: weaker guard on an existing privileged function
- `IMPL-*`: implementation safety regressions such as `delegatecall`, `selfdestruct`, or weaker initializer locking

Signals such as `ABI-001` and `COMPILER-*` are still useful, but usually need more context before they imply risk.

## Shortlist For Manual Review

The next manual review pass should focus on these three cases.

### 1. USYC pair 8

- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- manual review: [docs/case-studies/usyc-pair-8.md](case-studies/usyc-pair-8.md)
- local report: `reports/historical-upgrade-details/08-usyc-22976690-to-23977326/report.json`
- verdict: `block`
- risk score: `100`

Why it stands out:

- `AUTH-003` on upgrade authorization
- `AUTH-005` on `upgradeTo` and `upgradeToAndCall`
- `AUTH-004` on a new `sweep(address,uint256,address)` entrypoint
- `AUTH-008` and `AUTH-009` on control-plane changes

This is the highest-priority authority case in the dataset.

Manual review note:

- the first pass suggests this pair is better treated as a custom-access false-positive case study than as a confirmed upgrade-authority regression

### 2. USYC pair 4

- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- manual review: [docs/case-studies/usyc-pair-4.md](case-studies/usyc-pair-4.md)
- local report: `reports/historical-upgrade-details/04-usyc-18183121-to-19562310/report.json`
- verdict: `block`
- risk score: `100`

Why it stands out:

- multiple body-level guard regressions remained after false-positive reduction
- `AUTH-005` on `setFeeRecipient`, `setManagementFee`, `setOracle`, and `setUnderlying`
- `AUTH-004` on `setMinterAllowance`

This is the strongest guard-regression case in the dataset.

Manual review note:

- the first pass suggests the pair is better interpreted as an owner-to-fund-admin authority migration, with a real `tx.origin` review concern, rather than as a batch of unguarded management functions

### 3. WLFI pair 1

- proxy: `0xda5e1988097297dcdc1f90d4dfe7909e847cbef6`
- manual review: [docs/case-studies/wlfi-pair-1.md](case-studies/wlfi-pair-1.md)
- local report: `reports/historical-upgrade-details/01-wlfi-20857295-to-23207432/report.json`
- verdict: `manual-review`
- risk score: `51`

Why it stands out:

- large privileged mutable surface expansion
- substantial ABI and compiler-profile changes
- useful contrast against the two stronger USYC cases

This is a good manual-review baseline because it may turn out to be a legitimate product upgrade rather than a security issue.

Manual review note:

- the first pass supports that baseline: this looks like a structured V2 feature rollout with owner, guardian, and vesting flows, not a clear exploit candidate

## Additional Top300 Case Studies

Additional manual reviews from the expanded top300 run:

- [docs/case-studies/usyc-pair-2.md](case-studies/usyc-pair-2.md)
- [docs/case-studies/usyc-pair-3.md](case-studies/usyc-pair-3.md)
- [docs/case-studies/usyc-pair-6.md](case-studies/usyc-pair-6.md)
- [docs/case-studies/move-pair-1.md](case-studies/move-pair-1.md)
- [docs/case-studies/msusd-pair-1.md](case-studies/msusd-pair-1.md)
- [docs/case-studies/sent-pair-1.md](case-studies/sent-pair-1.md)

Current pattern after manual review:

- some shortlist items are genuine source-level problems or strong review concerns
- some are expected bootstrap or feature-rollout upgrades that the analyzer currently ranks too high
- some are business-logic migrations where the right output is `design-risk` or `manual-review`, not `confirmed vulnerability`

The most promising cases for deeper exploit validation remain the ones that survive source review with a concrete security claim, such as PLLD pair 2. The newer top300 additions reviewed so far mostly strengthen the analyzer's case-study corpus rather than producing immediate PoC candidates.

## Notes

- The historical shortlist is a triage output, not a vulnerability disclosure list.
- The replay script with intentionally dangerous proposals is kept in the repository as a detector validation step:

```bash
node scripts/replay-live-derived-dangerous-upgrades.mjs --limit 5
```

- That replay validates the analyzer against real verified source bundles, but it does not claim that the live contracts are vulnerable.
