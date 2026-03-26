# Case Study: msUSD Pair 2

## Pair

- asset: `Main Street USD`
- proxy: `0x4ba01f22827018b4772cd326c7627fb4956a7c00`
- pair index: `2`
- current block: `23941447`
- proposed block: `24034810`
- current implementation: `0x7ea01d56932f82370b11686dee4d8fa777845bd8`
- proposed implementation: `0x96271bea7a9c4b8edd6c3a05e548f05f157ada46`
- current contract: `src/v2/msUSDV2.sol:msUSDV2`
- proposed contract: `src/v2/msUSDV2.sol:msUSDV2`
- automated verdict: `manual-review`
- automated risk score: `43`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `COMPILER-002`
- `COMPILER-001`
- `COMPILER-004`

At face value this looked like a routine V2 refinement.

## Manual Review

### 1. The key change is a harder upgrade path

The proposal adds:

- `UpgraderTimelockUpgradeable`
- `scheduleUpgrade(address)`
- `cancelScheduledUpgrade()`
- `setUpgradeDelay(uint256)`

and changes:

- current: `_authorizeUpgrade(...) onlyOwner`
- proposed: `_authorizeUpgrade(...) onlyOwner` plus `_checkTimelock(newImpl)`

That is a governance hardening change, not a weakening change.

### 2. The timelock initializer is not the main risk here

The proposal calls:

- `__UpgradeTimelock_init()`

from `initialize(...)`, but the historical upgrade transaction looks like a batch admin rollout rather than a public exploit scenario.

Even if the timelock storage were left at zero defaults, the helper still:

- falls back to a default one-day delay in `scheduleUpgrade(...)`
- does not create a public privilege-escalation path

So the practical risk is operational correctness, not outsider exploitability.

### 3. This pair is mostly a safer governance variant of the same token

The token logic for:

- minting
- burning
- custody-based OFT bridging

stays materially the same. The meaningful addition is the upgrade delay control plane.

## Final Assessment

msUSD pair 2 is not a vulnerability candidate.

- classify: this as an upgrade-governance hardening change
- downgrade: exploit framing
- keep: this as a useful positive case for the analyzer because the ABI changed while the security posture arguably improved
- do not treat: this as PoC-worthy
