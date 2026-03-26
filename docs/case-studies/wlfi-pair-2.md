# Case Study: WLFI Pair 2

This note documents a manual review pass for the second WLFI historical upgrade pair from the top300 shortlist.

## Pair

- asset: `World Liberty Financial`
- proxy: `0xda5e1988097297dcdc1f90d4dfe7909e847cbef6`
- pair index: `2`
- current block: `23207432`
- proposed block: `23835547`
- current implementation: `0x0959a6eaea3c23148fe69ddd703c277bc6ad79cc`
- proposed implementation: `0xef48944abefff3f668f5324c050cd406618b771d`
- current contract: `contracts/wlfi/WorldLibertyFinancialV2.sol:WorldLibertyFinancialV2`
- proposed contract: `contracts/wlfi/WorldLibertyFinancialV2.sol:WorldLibertyFinancialV2`
- automated verdict: `manual-review`
- automated risk score: `39`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `ABI-002`
- `COMPILER-004`

At face value this looked like a small V2 surface expansion without a strong storage or authority signal.

## Manual Review

### 1. The new functionality stays owner-gated

The biggest functional addition is:

- `ownerBatchReallocateFrom(address[],address[],uint256[])`

It is explicitly:

- `external onlyOwner`

and it simply loops through the same internal logic that now backs:

- `ownerReallocateFrom(...)`

via:

- `_ownerReallocateFrom(...)`

So this is not a missing-guard issue. It is an owner-only batch convenience wrapper.

### 2. The reallocation logic was refactored, not opened up

The proposed implementation moves the older reallocation flow into:

- `_ownerReallocateFrom(...)`

and adds one extra operational step:

- temporarily clear blacklist status on `_from`
- perform burn/mint and registry updates
- restore blacklist status

That increases complexity, but it does not create a new public entrypoint for arbitrary users.

### 3. The other visible changes are low-signal

The pair also changes:

- `renounceOwnership()` mutability from `view` to non-`view`
- `claimVest()` comments
- `getPastVotes(...)` now explicitly reverts with `NotImplemented()`

None of those read like new privilege loss or a new exploit path.

## Final Assessment

WLFI pair 2 is not a strong security finding.

- downgrade: the pair as an exploit candidate
- keep: this as a low-intensity product and admin-surface follow-up
- classify: this as `feature rollout / operational refactor`
- do not treat: this as PoC-worthy on current evidence

This pair is useful mostly as a contrast case: the analyzer still surfaced a real mutable-surface change, but source review suggests a routine owner-controlled refinement rather than a vulnerability.
