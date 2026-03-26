# Case Study: USYC Pair 6

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `6`
- current block: `19586120`
- proposed block: `20715368`
- current implementation: `0xba66bf45ae8df864647d15c28c57b900dedc03fa`
- proposed implementation: `0x52acd57016e8b35568639eff109150a944de0601`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- automated verdict: `manual-review`
- automated risk score: `63`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `STORAGE-003`
- `AUTH-CUSTOM-GUARD-setteller-address`
- `ABI-002`
- `ABI-003`
- `COMPILER-004`

At face value this looked like a custom-guarded privileged setter plus a storage-meaning change.

## Manual Review

### 1. The upgrade path stayed owner-controlled

Current implementation:

- `_authorizeUpgrade(...)` calls `_checkOwner()`

Proposed implementation:

- `_authorizeUpgrade(...)` still calls `_checkOwner()`

So this pair is not an upgrade-authority regression.

### 2. `setTeller(...)` is new, but it is not unguarded

The automated pass already downgraded this to a custom-guard finding, and that holds up on source review.

The proposed implementation adds:

- `setTeller(address)`

and protects it with:

- `_assertFundAdmin()`

That same guard model already exists in the current implementation for management functions such as:

- `setFeeRecipient(...)`
- `setManagementFee(...)`
- `setOracle(...)`
- `setUnderlying(...)`

Manual conclusion:

- keep `AUTH-CUSTOM-GUARD-setteller-address`
- do not escalate it into a missing-guard claim

### 3. The real change is a business-logic migration from oracle-based pricing to teller-based previews

Current implementation:

- stores `oracle`
- stores `feeRecipient`
- stores `managementFee`
- calculates deposit and withdrawal values from oracle price reads

Proposed implementation:

- deprecates `feeRecipient`, `oracle`, and `managementFee`
- introduces `Teller public teller`
- moves deposit and withdraw math to `teller.buyPreview(...)` and `teller.sellPreview(...)`
- hardcodes `managementFee()` to return `0`

This is not a minor patch. It is a redesign of how issuance and redemption are priced.

### 4. The storage signal looks semantic, not catastrophic

The proposed state keeps old slots as deprecated placeholders:

- `address private _f`
- `uint256 private mF`
- `uint256 internal _uD`

and reuses an address-shaped slot for:

- `Teller public teller`

That supports the analyzer’s newer `STORAGE-003` interpretation:

- meaningful slot meaning change
- not an obvious pre-tail collision

### 5. Transfer restrictions also became more complex

The proposed implementation adds:

- `_checkCanReceiveFrom(...)`
- role-aware transfer restrictions based on `authority.getUserRoles(...)`

This widens the product and policy surface even though it does not obviously weaken admin protection.

## Final Assessment

USYC pair 6 is a strong design-review case, but not a strong confirmed-vulnerability case.

- keep: the custom-guard review signal on `setTeller(...)`
- keep: the semantic storage-change signal
- escalate: the fact that token pricing and redemption now depend on a new external teller dependency
- do not treat: this as PoC-ready based on the current evidence
