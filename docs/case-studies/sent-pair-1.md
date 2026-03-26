# Case Study: SENT Pair 1

This note documents a manual review pass for the first SENT historical upgrade pair from the top300 shortlist.

## Pair

- asset: `Sentient`
- proxy: `0x56a3ba04e95d34268a19b2a4474dc979babdaf76`
- pair index: `1`
- current block: `22571964`
- proposed block: `23711944`
- current implementation: `0x49ada51cf3462cb4b42a44ea863b60f99d26b6d2`
- proposed implementation: `0x9fec872531c42437c659d76db69bd6441238150f`
- current contract: `contracts/SentientToken.sol:SentientToken`
- proposed contract: `src/SentientTokenV1.sol:SentientTokenV1`
- automated verdict: `manual-review`
- automated risk score: `48`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `COMPILER-002`
- `ABI-003`
- `COMPILER-001`
- `COMPILER-004`
- `STORAGE-002`

At face value this looked like a routine V1 feature and compiler migration.

## Manual Review

### 1. The upgrade and pause authority remained stable

Current implementation:

- `_authorizeUpgrade(...)` is `onlyRole(DEFAULT_ADMIN_ROLE)`
- `pause()` / `unpause()` are `onlyRole(DEFAULT_ADMIN_ROLE)`

Proposed implementation:

- `_authorizeUpgrade(...)` is still `onlyRole(DEFAULT_ADMIN_ROLE)`
- `pause()` / `unpause()` are still `onlyRole(DEFAULT_ADMIN_ROLE)`

So this pair is not an authority-regression case.

### 2. The main change is the inflation model

Current implementation uses a period-based inflation model:

- `inflationPercentage`
- `inflationTimeFrame`
- `mintInflationAmount(address,uint256)`

Proposed implementation keeps the old variables as deprecated storage and adds a new time-based model:

- `mintInflationPerSecond`
- `lastClaimInflation`
- `maxMintInflationPerSecond`
- `CLAIM_INFLATION_ROLE`
- `claimInflation(address)`

That is a meaningful monetary-policy change, even if it is not an obvious vulnerability.

### 3. The reinitializer was executed in the upgrade transaction

The upgrade transaction:

- `0x6db04fdadcc3430de14d2f1762901ba6ec94307909ed664491d009fc28084024`

emitted both:

- `Upgraded(...)`
- `Initialized(2)`

So the new V1 storage appears to have been initialized in the same transaction as the upgrade.

That makes this a much weaker candidate for any “uninitialized upgrade” claim.

### 4. There is still an operational design risk worth noting

The proposed implementation documents:

- “You MUST call claimInflation() BEFORE changing the rate”

but `setMintInflationPerSecond(...)` does not enforce that sequence on-chain.

That means a trusted admin can still:

- leave inflation unclaimed for a period
- change the rate
- then have the new rate apply over the whole elapsed interval

This is not a public exploit path, but it is a governance and monetary-policy footgun.

## Final Assessment

SENT pair 1 is not a confirmed security issue.

- keep: this pair in `manual-review`
- treat: the core change as a monetary-policy and initialization-flow migration
- note: the most interesting residual risk is operational, not permissionless
- do not treat: this as PoC-worthy without a stronger exploit hypothesis

This case is useful because it shows that business-logic migrations can matter even when the privilege model stays stable.
