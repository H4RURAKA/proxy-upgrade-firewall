# Case Study: msUSD Pair 1

This note documents a manual review pass for the first msUSD historical upgrade pair from the top300 shortlist.

## Pair

- asset: `Main Street USD`
- proxy: `0x4ba01f22827018b4772cd326c7627fb4956a7c00`
- pair index: `1`
- current block: `23941447`
- proposed block: `23941447`
- current implementation: `0xc05fb730ffc1099464118a705acd2bf5d81844cc`
- proposed implementation: `0x7ea01d56932f82370b11686dee4d8fa777845bd8`
- current contract: `script/utils/EmptyUUPS.sol:EmptyUUPS`
- proposed contract: `src/v2/msUSDV2.sol:msUSDV2`
- automated verdict: `manual-review`
- automated risk score: `54`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `AUTH-007`
- `AUTH-008`
- `ABI-003`
- `COMPILER-004`
- `STORAGE-002`

At face value this looked like a large authority and ABI expansion.

## Manual Review

### 1. This pair is mostly a bootstrap transition, not a normal V1-to-V2 app upgrade

The current implementation is:

- `EmptyUUPS`

and its own source explains that it exists as:

- an initial placeholder implementation behind multiple UUPS proxies
- a way to support deterministic proxy addresses across chains

That means the comparison is not “full token implementation vs richer token implementation.”
It is closer to:

- placeholder UUPS shell
- to real application logic

This matters because a placeholder implementation naturally makes `AUTH-007` and `AUTH-008` look dramatic even when the transition is expected.

### 2. The new implementation does add a real privileged surface

The proposed implementation introduces owner-controlled methods such as:

- `setSupplyLimit(uint256)`
- `setMinter(address)`
- `setStakedmsUSD(address)`
- `_authorizeUpgrade(...) onlyOwner`

It also adds application logic for:

- minting
- burning
- cross-chain send paths
- home-chain custody-based OFT bridging

So the mutable surface genuinely expanded, but that is inherent to moving from a placeholder to a real token contract.

### 3. The historical transaction already bundled the transition with initialization

The upgrade transaction:

- `0x980bf6b37ef20054e4971adcb83e8a0c4044aaf8de0e12e4f33d2eb72776719e`

occurred in the same block as the prior placeholder state and emitted:

- `Upgraded(...)`
- `OwnershipTransferred(...)`
- token minting events
- `Initialized(...)`

So this does not read like a proxy left dangling on `EmptyUUPS` and then later initialized by an arbitrary caller.

### 4. The right interpretation is “bootstrap rollout,” not “authority regression”

The strongest automated wording is too aggressive here because the current implementation is intentionally minimal.

This pair is better used as:

- evidence that the analyzer can spot large control-surface jumps
- but also evidence that placeholder implementations should probably be classified separately in the ranking pipeline

## Final Assessment

msUSD pair 1 is not a strong security finding.

- downgrade: the authority-regression interpretation
- keep: the observation that the mutable and upgradeable surface grew substantially
- classify: this as a bootstrap placeholder-to-product transition
- do not treat: this pair as PoC-worthy on current evidence

This case is useful because it suggests a concrete analyzer improvement: placeholder or shell implementations should be identified explicitly so they do not dominate the shortlist with expected bootstrap transitions.
