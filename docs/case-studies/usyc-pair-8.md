# Case Study: USYC Pair 8

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `8`
- current block: `22976690`
- proposed block: `23977326`
- current implementation: `0xe6b0c4f8766abf8f77ad00c27fb00cef81ccc9af`
- proposed implementation: `0xbf0f2f3aad6b99893d80c550fbacec915545eb92`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/YieldCoin.sol:YieldCoin`
- automated verdict: `block`
- automated risk score: `100`

## Automated Signals

The automated pass flagged this pair for:

- `STORAGE-001`
- `AUTH-004-sweep-address-uint256-address`
- `AUTH-003`
- `AUTH-005-upgradeto-address`
- `AUTH-005-upgradetoandcall-address-bytes`
- `AUTH-008`
- `AUTH-009`

At face value this looked like a strong upgrade-authority regression plus a new unguarded fund-moving entrypoint.

## Manual Review

### 1. `_authorizeUpgrade` did not become unguarded

The current implementation uses OpenZeppelin `OwnableUpgradeable`:

- `ShortDurationYieldCoin._authorizeUpgrade(...)` calls `_checkOwner()`

The proposed implementation still gates upgrades:

- `YieldCoin._authorizeUpgrade(...)` calls `_assertOwner()`

The inherited UUPS entrypoints still route through `_authorizeUpgrade(...)`:

- `upgradeTo(address)` calls `_authorizeUpgrade(newImplementation)`
- `upgradeToAndCall(address,bytes)` calls `_authorizeUpgrade(newImplementation)`

Manual conclusion:

- `AUTH-003`
- `AUTH-005-upgradeto-address`
- `AUTH-005-upgradetoandcall-address-bytes`

look like false positives caused by the analyzer not recognizing Circle's custom `_assertOwner()` helper as an owner guard.

### 2. `sweep(...)` is not unguarded

The proposed `YieldCoin.sweep(address,uint256,address)` is new, but it is not permissionless:

- it calls `_assertFundAdmin()`
- it additionally requires `authority.doesUserHaveRole(_recipient, ROLE_RESERVES)`

The helper lives in the custom `Access` contract:

- `_assertFundAdmin()` reverts unless `authority.doesUserHaveRole(msg.sender, ROLE_FUND_ADMIN)` is true

Manual conclusion:

- `AUTH-004-sweep-address-uint256-address`

is also a false positive. The function is sensitive and worth reviewing, but it is not exposed as an unguarded public drain path in the verified source.

### 3. The control-plane change looks intentional, but still deserves review

The ownership model changed:

- current: OpenZeppelin `OwnableUpgradeable` with `_owner` and `uint256[49] __gap`
- proposed: custom two-step `Ownable` with `owner`, `pendingOwner`, and `uint256[48] __gap`

This explains the automated storage evidence:

- current slot evidence pointed at `__gap`
- proposed slot evidence pointed at `pendingOwner`

That pattern is consistent with consuming one slot from a reserved gap to add two-step ownership, not with an obvious accidental collision.

Manual conclusion:

- `AUTH-008`
- `AUTH-009`

are real semantic changes

but they read more like an ownership-model migration than an accidental privilege downgrade.

### 4. The upgrade is still large enough for manual review

Even after discounting the authority false positives, this is not a trivial patch:

- implementation changed from `ShortDurationYieldCoin` to `YieldCoin`
- the interface changed materially
- deposit/withdraw/teller/underlying-related surface was removed
- `sweep(...)`, `acceptOwnership()`, and minter-allowance helpers were added
- compiler moved from `0.8.17` to `0.8.26`
- target EVM moved from `london` to `cancun`

So the pair still belongs in a manual-review bucket. It just does not support the original automated claim that upgrade authorization became unguarded.

## Final Assessment

USYC pair 8 is a good example of a high-signal shortlist item that becomes more nuanced after source review.

- keep: control-plane migration, large ABI shift, and ownership-model change as real review points
- downgrade: the strongest authority findings from `block-level regression` to `custom-access false positive`
- do not claim: a confirmed vulnerable upgrade path or an unguarded `sweep(...)` exploit
