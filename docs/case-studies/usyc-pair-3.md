# Case Study: USYC Pair 3

This note documents a manual review pass for the third USYC historical upgrade pair from the top300 shortlist.

## Pair

- asset: `Circle USYC`
- proxy: `0x136471a34f6ef19fe571effc1ca711fdb8e49f2b`
- pair index: `3`
- current block: `17636683`
- proposed block: `18183121`
- current implementation: `0x3f836d30924edbfb75dd92ce4644874392f2f7a1`
- proposed implementation: `0x8c874963e95128c48151a53d1a39826ccc9835cc`
- current contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- proposed contract: `src/core/coins/ShortDurationYieldCoin.sol:ShortDurationYieldCoin`
- automated verdict: `manual-review`
- automated risk score: `44`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `STORAGE-003`
- `ABI-003`
- `COMPILER-004`
- `STORAGE-002`

At face value this looked like a moderate storage-meaning change plus a wider mutable surface.

## Manual Review

### 1. The UUPS authority path stayed owner-controlled

Current implementation:

- `_authorizeUpgrade(...)` calls `_checkOwner()`

Proposed implementation:

- `_authorizeUpgrade(...)` still calls `_checkOwner()`

So this pair is not evidence of a weakened upgrade authorizer.

### 2. The allowlist model changed from mutable storage to immutable implementation configuration

The proposed implementation changes:

- current: `IAllowlist public allowlist;`
- proposed: `IAllowlist public immutable allowlist;`

and preserves the old proxy storage slot as deprecated state:

- `IAllowlist public _a;`

This is a meaningful control-plane change:

- current design lets the owner update the allowlist address with `setAllowlist(...)`
- proposed design removes `setAllowlist(...)`
- future allowlist changes now require deploying a new implementation with a different immutable constructor argument

Manual conclusion:

- `STORAGE-003` is directionally right as a semantic change signal
- the real story is governance and configuration migration, not storage corruption

### 3. The minter model expanded from a single address to quota-based minters

The proposed implementation replaces:

- `address public minter;`

with:

- `mapping(address => uint256) public minters;`

and replaces the older setter with:

- `setMinter(address,uint256)`

That is a substantive operational change:

- minting moves from a single designated address
- to multiple addresses with configurable mint quotas

This is a review-worthy privilege-model change, even though it is still owner-controlled.

### 4. The token flow became stricter, not looser

The proposed deposit path now requires:

- `allowlist.isSystem(msg.sender)` on `_depositFor(...)`

and it keeps recipient checks behind:

- `allowlist.hasTokenPrivileges(...)`

It also adds:

- `burnFor(address,uint256)`
- `setNameSymbol(string,string)`

So the mutable surface did grow, but it did so inside an owner-governed operational model rather than by dropping guards.

## Final Assessment

USYC pair 3 is best read as a governance and product migration case.

- downgrade: any reading that implies a lost upgrade guard
- keep: the semantic storage and authority-model changes
- keep: this pair in `manual-review`
- do not treat: this as a high-confidence exploit candidate

This case is useful because it shows a kind of upgrade the analyzer should keep surfacing, but with wording closer to “control-plane migration” than to “vulnerability.”
