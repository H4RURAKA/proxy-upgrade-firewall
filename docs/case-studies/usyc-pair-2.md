# Case Study: USYC Pair 2

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `2`
- current block: `17530913`
- proposed block: `17636683`
- current implementation: `0x5c08ee2c486e6cb127eff5bb54d4a3919112c551`
- proposed implementation: `0x3f836d30924edbfb75dd92ce4644874392f2f7a1`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- automated verdict: `block`
- automated risk score: `73`

## Automated Signals

The automated pass flagged this pair for:

- `STORAGE-001`
- `ABI-001`
- `ABI-003`
- `COMPILER-004`

At face value this looked like a hard storage-layout break plus a large external-surface change.

## Manual Review

### 1. The upgrade authority did not regress

The pair does not show an ownership or upgrade-path regression.

Current implementation:

- `_authorizeUpgrade(...)` calls `_checkOwner()`

Proposed implementation:

- `_authorizeUpgrade(...)` still calls `_checkOwner()`

So this is not an authority case. The important review work is in storage semantics and business-logic migration.

### 2. The storage change is real, but it reads more like a semantic migration than a classic collision

The most important source-level change is:

- current: `mapping(address => bool) public depositable;`
- proposed: `IERC20Metadata public underlying;`

That is a real type change at the same logical slot position, which explains why the analyzer raised `STORAGE-001`.

But this does not read like a straightforward “old slot data is overwritten and corrupted” case:

- the old design used a multi-asset `depositable` registry
- the new design moves to a single `underlying` token model
- old mapping entries become dead legacy state rather than an obviously exploitable overlap

Manual conclusion:

- keep the storage change as a serious review signal
- downgrade the strongest “catastrophic collision” interpretation

This looks closer to a semantic storage migration than to a textbook pre-tail slot smash.

### 3. The product model changed materially

The proposed implementation replaces the older deposit path with:

- `deposit(uint256)`
- `depositFor(address,uint256)`
- `withdraw(uint256,uint8,bytes32,bytes32)`
- `withdrawTo(address,uint256,uint8,bytes32,bytes32)`

It also replaces the older fee path with:

- `processFees(uint256,uint256)` callable only by `oracle`

and changes burn behavior so the contract now emits:

- `BurnToFiat(address,uint256)`

This is a large business-logic migration, not a cosmetic patch.

### 4. The operational migration is more important than the raw ABI count

The new implementation introduces `underlying` as an address-shaped state variable and adds:

- `setUnderlying(address)`

That means the upgrade path is operationally sensitive:

- the new implementation expects a single configured underlying token
- a live proxy upgrade would need that state to be configured correctly after the migration

This is the sort of change that deserves human review even if it does not produce an immediate exploit narrative.

## Final Assessment

USYC pair 2 is not a strong confirmed-vulnerability case.

- downgrade: the strongest “obvious storage corruption” framing
- keep: this as a meaningful storage-semantic and business-logic migration
- treat: this as `manual-review`, not as a PoC-ready exploit candidate
