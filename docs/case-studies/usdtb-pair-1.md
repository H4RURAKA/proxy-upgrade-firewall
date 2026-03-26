# Case Study: USDtb Pair 1

This note documents a top300 manual review pass for the first USDtb historical upgrade pair.

## Pair

- asset: `USDtb`
- proxy: `0xc139190f447e929f090edeb554d95abb8b18ac1c`
- pair index: `1`
- current block: `21287284`
- proposed block: `23569292`
- current implementation: `0xea8a763b5b1f9c9c7aea64f33947448d9e39e475`
- proposed implementation: `0x9d6d77a21702b9afcf924983fbfb84aaaae79589`
- current contract: `contracts/usdtb/USDtb.sol:USDtb`
- proposed contract: `src/AnchorageTokenUSDtb.sol:AnchorageTokenUSDtb`
- automated verdict: `block`
- automated risk score: `97`

## Automated Signals

The automated pass flagged this pair for:

- `STORAGE-001`
- `ABI-001`
- `ABI-002`
- `COMPILER-002`
- `ABI-003`

At face value this looked like a hard storage break plus a large mutable-surface expansion.

## Manual Review

### 1. The storage finding looks too strong

The automated evidence was:

- current: `transferState` as `IUSDtbDefinitions.TransferState`
- proposed: `_transferState` as `USDtbStorage.TransferState`

But the proposed implementation explicitly declares a legacy storage mirror:

- `abstract contract USDtbStorage`
- comment: `STORAGE Mirrors USDtb's legacy storage. DO NOT reorder/remove. Only append after this block.`

The enum members are the same in both versions:

- `FULLY_DISABLED`
- `WHITELIST_ENABLED`
- `FULLY_ENABLED`

And the proposed contract keeps the field specifically to occupy the old slot:

- `TransferState internal _transferState;`

Manual conclusion:

- downgrade `STORAGE-001`

This reads much more like a semantic rename and storage-preservation shim than an obvious slot collision.

### 2. The new mutable functions are real, but they are explicitly role-gated

The proposed implementation adds:

- `blockAccounts(address[])` behind `onlyRole(BLOCKLISTER_ROLE)`
- `burn(address,uint256)` behind `onlyRole(MINTER_BURNER_ROLE)`
- `pause()` / `unpause()` behind `onlyRole(PAUSER_ROLE)`
- `initializeV2(address,address,address,address)` for migration setup

So `ABI-001` is a valid expansion signal, but this is not an “unguarded admin function” case.

### 3. The actual change is operational model, not a simple role loss

Current implementation:

- uses `MINTER_CONTRACT`
- uses separate blacklist and whitelist manager roles
- drives transfer policy through `transferState`
- exposes `addMinter`, `addBlacklistAddress`, `addWhitelistAddress`, `updateTransferState`, `rescueTokens`, and redistribution helpers

Proposed implementation:

- consolidates mint and burn into `MINTER_BURNER_ROLE`
- replaces whitelist/blacklist manager split with `BLOCKLISTER_ROLE`
- introduces explicit contract pausing with `PAUSER_ROLE`
- deprecates the old whitelist-oriented transfer-state model while keeping its storage slot reserved

That is a large product and trust-model migration, but it does not read like accidental storage corruption.

### 4. The mutability changes are intentional deprecations

The automated pass also flagged:

- `burn(uint256): nonpayable -> pure`
- `burnFrom(address,uint256): nonpayable -> pure`

In source, those paths are intentionally deprecated:

- both functions now revert with `Deprecated()`

That should still be reviewed for integration impact, but it is different from a silent mutability mistake.

## Final Assessment

USDtb pair 1 still belongs in `manual-review`, but the original `block` explanation is too blunt.

- downgrade: the `STORAGE-001` collision claim
- keep: the pair as a substantial product and governance migration
- keep: `ABI-001` and `ABI-003` as useful review signals
- focus: on role redesign, migration initialization, and downstream integration impact rather than on an obvious storage break

This case is useful because it highlights a storage-analysis gap:

- enum/type-label changes inside a deliberately mirrored legacy storage block should not be treated the same way as a true slot collision
