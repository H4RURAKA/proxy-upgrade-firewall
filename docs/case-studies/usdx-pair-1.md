# Case Study: USDX Pair 1

## Pair

- asset: `Hex Trust USD`
- proxy: `0xf8750b54d86be7ae9e32b4a0c826811198d63313`
- pair index: `1`
- current block: `21062695`
- proposed block: `21062736`
- current implementation: `0xe87e1f571a485deac08a81117ef1713d1261bce9`
- proposed implementation: `0xce2d107b6046e61a651484b4ee65023d89a42d7b`
- current contract: `contracts/HexTrustUSD.sol:HexTrustUSD`
- proposed contract: `contracts/HexTrustUSDV2.sol:HexTrustUSDV2`
- automated verdict: `manual-review`
- automated risk score: `37`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `COMPILER-001`
- `COMPILER-003`
- `COMPILER-004`

At face value this looked like a light feature rollout.

## Manual Review

### 1. The main change is LayerZero OFT support

The proposal extends the token with:

- `OFTCoreUpgradeable`
- `initializeV2()`
- `_debit(...)`
- `_credit(...)`
- `oftVersion()`
- `token()`
- `approvalRequired()`

This is a bridge and cross-chain feature rollout, not a subtle auth change hidden behind a compiler diff.

### 2. The upgrade authority did broaden

Current implementation:

- `_authorizeUpgrade(...)` requires `UPGRADE_ADMIN_ROLE`
- and is additionally `whenNotPaused`

Proposed implementation:

- `_authorizeUpgrade(...)` allows `onlyRoleOrDefaultAdmin(RoleConstant.UPGRADE_ADMIN_ROLE)`
- the pause requirement is removed

So the proposal does broaden the effective upgrade set:

- `defaultAdmin` can now authorize upgrades directly
- upgrades no longer require the paused state

That is a real governance change and worth flagging in review.

### 3. The reinitializer appears to have been executed in the upgrade transaction

The upgrade transaction:

- `0xf4a870e7d41fa8a18ed90a719775f2fb23bbf552b75d7d5c29930a981d96b070`

emits both:

- `Upgraded(...)`
- `Initialized(2)`

So this pair does not look like an uninitialized V2 rollout left open to arbitrary callers.

### 4. This is a governance and bridge-risk case, not an immediate outsider exploit

The bridge path introduces new mint-and-burn behavior across chains, and the upgrade gate became slightly more permissive.

That is security-relevant, but it is still an admin-governed trust-model change rather than a direct permissionless exploit.

## Final Assessment

USDX pair 1 is a meaningful manual-review case, but not a confirmed exploit case.

- keep: the governance broadening signal on upgrade authorization
- keep: the new bridge surface as a trust and operational risk
- note: the initializer risk appears mitigated by the historical upgrade transaction
- do not treat: this as PoC-worthy without a stronger exploit hypothesis
