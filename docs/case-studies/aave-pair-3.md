# Case Study: Aave Pair 3

This note documents a top300 manual review pass for the third Aave historical upgrade pair.

## Pair

- asset: `Aave`
- proxy: `0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9`
- pair index: `3`
- current block: `16852321`
- proposed block: `18870593`
- current implementation: `0x96f68837877fd0414b55050c9e794aecdbcfca59`
- proposed implementation: `0x5d4aa78b08bc7c530e21bf7447988b1be7991322`
- current contract: `src/contracts/AaveTokenV2.sol:AaveTokenV2`
- proposed contract: `src/AaveTokenV3.sol:AaveTokenV3`
- automated verdict: `block`
- automated risk score: `82`

## Automated Signals

The automated pass flagged this pair for:

- `STORAGE-001`
- `AUTH-009`
- `ABI-001`
- `COMPILER-002`
- `ABI-003`

The strongest signal was:

- `_balances: mapping(address => uint256)` becoming `mapping(address => DelegationAwareBalance)`

At face value that looks like a catastrophic mapping-value storage break.

## Manual Review

### 1. The storage change is more nuanced than the raw finding suggests

The proposed implementation replaces the plain ERC20 balance mapping with:

- `struct DelegationAwareBalance { uint104 balance; uint72 delegatedPropositionBalance; uint72 delegatedVotingBalance; DelegationMode delegationMode; }`

and stores:

- `mapping(address => DelegationAwareBalance) internal _balances`

That struct packs into a single 256-bit slot.

The old implementation stored:

- `mapping(address => uint256) private _balances`

If existing token balances fit into `uint104`, then the legacy slot value can be reinterpreted as:

- `balance = old uint256 value`
- delegated fields = `0`
- delegation mode = `0`

For AAVE-sized balances, that bound is not obviously violated. `uint104` is far larger than the historical AAVE supply in raw 18-decimal units.

Manual conclusion:

- downgrade the strongest “obvious collision” interpretation of `STORAGE-001`

This looks more like an intentional packed migration than a careless layout break.

### 2. The proposed source also shows explicit storage-compatibility scaffolding

`BaseAaveTokenV2` keeps several deprecated fields and padding regions:

- `uint256[3] private ______DEPRECATED_FROM_AAVE_V1`
- `bytes32 private __DEPRECATED_DOMAIN_SEPARATOR`
- `uint256[4] private ______DEPRECATED_FROM_AAVE_V2`

That pattern is consistent with a team that was thinking explicitly about historical layout continuity.

### 3. This is still a high-risk review because compatibility depends on assumptions

Even if the packed migration is intentional, it is not a trivial change.

Compatibility now depends on:

- balances fitting within `uint104`
- old high bits being zero
- delegation fields being safely defaulted from legacy state
- downstream governance logic correctly treating pre-upgrade holders as `NO_DELEGATION`

So the raw `STORAGE-001` message is too coarse, but the pair still deserves top-tier storage review.

### 4. The ABI and governance model changed materially

Current V2 exposes legacy governance-snapshot flows such as:

- `delegateBySig(...)`
- `delegateByTypeBySig(...)`
- `getPowerAtBlock(...)`
- `totalSupplyAt(...)`

Proposed V3 shifts toward:

- `initialize()`
- `metaDelegate(...)`
- `metaDelegateByType(...)`

and removes the old `_aaveGovernance` hook-oriented surface from the active interface.

This is a meaningful governance-architecture migration, not a cosmetic refactor.

## Final Assessment

Aave pair 3 should stay in the highest-priority manual-review bucket, but not because it is obviously a broken upgrade.

- downgrade: the literal “catastrophic storage collision” reading of `STORAGE-001`
- keep: this pair as a serious storage-and-governance migration review item
- focus: on proving the packed balance migration assumptions, not on generic ABI churn

This case is useful because it shows a boundary of static diffing:

- some storage shape changes are intentionally compatible, but only under domain-specific invariants that the analyzer cannot yet prove automatically
