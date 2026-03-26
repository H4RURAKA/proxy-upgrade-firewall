# Case Study: USYC Pair 4

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `4`
- current block: `18183121`
- proposed block: `19562310`
- current implementation: `0x8c874963e95128c48151a53d1a39826ccc9835cc`
- proposed implementation: `0x73f48add7c138145a568e0a2d5af06efe4d700d6`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- automated verdict: `block`
- automated risk score: `100`

## Automated Signals

The automated pass flagged this pair for:

- `STORAGE-001`
- `AUTH-004-setminterallowance-address-uint256`
- `AUTH-005-setfeerecipient-address`
- `AUTH-005-setmanagementfee-uint256`
- `AUTH-005-setoracle-address`
- `AUTH-005-setunderlying-address`
- `ABI-001`
- `STORAGE-002`

At face value this looked like a batch of owner-only management functions becoming unguarded.

## Manual Review

### 1. The flagged functions are not unguarded

The proposed implementation still protects the functions that were flagged by the automated pass:

- `setMinterAllowance(address,uint256)` calls `_assertFundAdmin()`
- `setFeeRecipient(address)` calls `_assertFundAdmin()`
- `setManagementFee(uint256)` calls `_assertFundAdmin()`
- `setOracle(address)` calls `_assertFundAdmin()`
- `setUnderlying(address)` calls `_assertFundAdmin()`

So the literal claim made by:

- `AUTH-004-setminterallowance-address-uint256`
- `AUTH-005-setfeerecipient-address`
- `AUTH-005-setmanagementfee-uint256`
- `AUTH-005-setoracle-address`
- `AUTH-005-setunderlying-address`

is too strong. These are not permissionless entrypoints in the verified source.

### 2. The authority model did change in a meaningful way

Even though the functions are still guarded, the guard changed materially.

Current implementation:

- the same management actions use `_checkOwner()`
- authority is concentrated in the proxy owner path

Proposed implementation:

- those actions move to `_assertFundAdmin()`
- `_assertFundAdmin()` checks `authority.doesUserHaveRole(tx.origin, Role.System_FundAdmin)`
- the design also replaces the old allowlist-oriented checks with an `IAuthority` entitlement model

Manual conclusion:

- the automated finding text is wrong when it says `guard: none`
- but there is still a real control-plane change
- this is best described as `owner-only -> role-based fund admin`

That is exactly the sort of semantic upgrade reviewers should care about.

### 3. `tx.origin` is the most concerning part of the new guard model

The new helper does not gate fund-admin actions on `msg.sender`.

It gates them on:

- `authority.doesUserHaveRole(tx.origin, Role.System_FundAdmin)`

That is a real review concern because:

- it ties authorization to the originator instead of the immediate caller
- it can complicate assumptions around relayers, wrapper contracts, and call chains
- it is a meaningful change from the previous direct owner check

This is not the same thing as an unguarded function, but it is arguably the strongest manual-review signal in this pair.

### 4. The storage finding looks overstated

The automated storage evidence was:

- current slot 11: `_a` as `IAllowlist`
- proposed slot 11: `_a` as `address`

In source, both versions mark `_a` as deprecated state.

- current: `IAllowlist public _a`
- proposed: `address private _a`

At the EVM storage level, both are single-slot address-shaped values. That makes this look more like a type-label or semantic diff than an actual slot collision.

The added state from `STORAGE-002`:

- `_decimals`
- `_initialDomainSeparator`
- `_underlyingDecimals`

also reads like appended migration state rather than obvious pre-tail corruption.

Manual conclusion:

- `STORAGE-001` in this pair is probably a false positive
- `STORAGE-002` is still worth reviewing, but it does not read like a catastrophic layout break on its own

### 5. This upgrade still changes a lot of behavior

This pair is not a cosmetic patch.

The proposed implementation:

- replaces allowlist-based checks with entitlement-based `authority` checks
- adds `migrate(string,string,uint8)` behind `_assertFundAdmin()`
- renames the minter-management API from `setMinter(...)` to `setMinterAllowance(...)`
- changes deposit and withdraw permission flows
- introduces EIP-2612-related state such as `_initialDomainSeparator`

So even after discounting the strongest false positives, this is still a substantial governance and product-surface change.

## Final Assessment

USYC pair 4 is stronger than pair 8 as a manual-review candidate, but not for the reason the automated report first suggested.

- downgrade: the `unguarded function` interpretation
- keep: the authority migration from owner-only to fund-admin role checks
- escalate: the use of `tx.origin` inside `_assertFundAdmin()`
- downgrade: the specific `STORAGE-001` collision claim
- keep: the pair in a high-priority manual-review bucket because the privilege model and token operation flow changed materially
