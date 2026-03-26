# Case Study: USYC Pair 1

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `1`
- current block: `17381914`
- proposed block: `17530913`
- current implementation: `0x0dc09046f22ec756e633eca91618e3c9a372699a`
- proposed implementation: `0x5c08ee2c486e6cb127eff5bb54d4a3919112c551`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- automated verdict: `manual-review`
- automated risk score: `34`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `ABI-003`
- `COMPILER-004`
- `STORAGE-002`

At face value this looked like an append-only feature expansion.

## Manual Review

### 1. The upgrade path stayed owner-controlled

Current implementation:

- already inherits `OwnableUpgradeable` and `UUPSUpgradeable`

Proposed implementation:

- still uses `_checkOwner()` for `_authorizeUpgrade(...)`

So this pair is not an authority-regression case.

### 2. The proposal mostly introduces the first operational management surface

Relative to the earlier implementation, the proposed version adds:

- allowlist storage and `setAllowlist(...)`
- explicit `minter` state and `setMinter(...)`
- `feeRecipient`, `managementFee`, and `oracle` administration
- `depositable` token registry and `setDepositable(...)`
- fee processing and `depositAndTransfer(...)`
- `tradeToFiat(...)`

This is a substantial product rollout, but all of the new administrative entrypoints remain owner-gated.

### 3. The storage finding is benign append-only state

The `STORAGE-002` signal is explained by new appended variables such as:

- `allowlist`
- `minter`
- `feeRecipient`
- `oracle`
- `managementFee`
- `cachedTotalInterest`
- `depositable`

This is exactly the kind of case where an append-only storage alert is informative but not alarming.

### 4. Permission checks became more explicit

The proposal also tightens permission logic by moving to:

- `allowlist.hasTokenPrivileges(...)`

instead of the earlier:

- `allowlist.isAllowed(...)`

That reads more like a policy-model change than a security regression.

## Final Assessment

USYC pair 1 is not a vulnerability candidate.

- keep: this as a clean example of append-only growth and governance-controlled feature rollout
- downgrade: any exploit framing
- treat: this as `manual-review` only because it materially changes the token’s operational model
- do not treat: this as PoC-worthy
