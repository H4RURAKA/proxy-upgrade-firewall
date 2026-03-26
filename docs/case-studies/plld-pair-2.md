# Case Study: PLLD Pair 2

This note documents a top300 manual review pass for one of the strongest authority-heavy shortlist items.

## Pair

- asset: `Palladium Network`
- proxy: `0xfc8dcfca8a37a855e352098af205b3a537b6b026`
- pair index: `2`
- current block: `23089938`
- proposed block: `23132909`
- current implementation: `0xc87811ec07798e419c2cb7f1232216eb595426f5`
- proposed implementation: `0x62e9d75efabd3f3411ac481bba33cc7295f6ae98`
- current contract: `PalladiumV2.sol:PalladiumV2`
- proposed contract: `PalladiumV2.sol:PalladiumV2`
- automated verdict: `block`
- automated risk score: `100`

## Automated Signals

The automated pass flagged this pair for:

- `AUTH-004-multisigPause`
- `AUTH-004-multisigUnpause`
- `AUTH-MIGRATION-pause`
- `AUTH-005-pause`
- `AUTH-MIGRATION-unpause`
- `AUTH-005-unpause`
- `ABI-001`
- `AUTH-007`

At face value this looked like a role-based pause path being replaced by owner-only controls plus new unguarded multisig wrappers.

## Manual Review

### 1. The multisig wrapper findings are too strong

The proposed implementation adds:

- `multisigPause()`
- `multisigUnpause()`
- `multisigBlacklist(address)`
- `multisigUnblacklist(address)`

Those wrappers are public, but they immediately call:

- `submitTransaction(address,uint256,bytes)`

and `submitTransaction(...)` is still gated by:

- `onlyOwner`

Because this is an internal call path, `msg.sender` is still the original external caller. So the wrappers are not permissionless admin entrypoints in the way `AUTH-004-*` suggests.

Manual conclusion:

- downgrade `AUTH-004-multisigPause`
- downgrade `AUTH-004-multisigUnpause`

These are better described as wrapper functions around an owner-controlled multisig flow, not as open admin calls.

### 2. The authority model really did change

Current implementation:

- `pause()` and `unpause()` are `onlyRole(PAUSER_ROLE)`
- blacklist administration is split between `DEFAULT_ADMIN_ROLE` and specialized roles

Proposed implementation:

- `pause()` and `unpause()` move to `onlyOwner`
- blacklist administration also moves to `onlyOwner`
- a fixed `address[3] owners` committee and `required = 2` confirmation threshold are introduced

So the analyzer was directionally right that this is an authority migration, but not every `role -> owner` move is automatically weaker. Here, `owner` no longer means a single EOA. It means a three-member owner set with multisig-style execution.

Manual conclusion:

- keep `AUTH-MIGRATION-*`
- downgrade the strongest `weaker guard` interpretation

This is a control-plane redesign and deserves review, but it does not read like a simple guard deletion.

### 3. Source review found a different bug that the automated pass did not describe well

The proposed multisig code contains this helper:

- `isConfirmOwner(address addr)`

Its logic returns `true` even when the address is not found in `owners`.

That means:

- `confirmOwner` is not actually restricting `confirmTransaction(...)` to owners

This is a real authorization bug in the proposed multisig logic.

Important nuance:

- `executeTransaction(...)` is still `onlyOwner`
- `required` is hardcoded to `2`
- `submitTransaction(...)` auto-confirms once on submission

So this does not immediately read like a permissionless execution exploit in the current configuration. But it is still a broken authorization helper and a strong sign that the new multisig logic needs deeper review before approval.

Manual conclusion:

- keep this pair in a high-priority review bucket
- but for a different reason than the original `AUTH-004` wrapper findings

### 4. The ABI growth is real and operationally significant

The proposed implementation adds a full transaction queue:

- `submitTransaction(...)`
- `confirmTransaction(...)`
- `executeTransaction(...)`
- `revokeConfirmation(...)`
- `removeTransaction(...)`
- `setOwners(...)`

That is a major governance-surface expansion even if the wrappers themselves are not unguarded.

## Final Assessment

PLLD pair 2 is still a strong manual-review candidate, but the automated explanation needs refinement.

- downgrade: the claim that `multisigPause()` and `multisigUnpause()` are directly unguarded admin calls
- keep: the authority migration from role-based pause control into a new owner-committee model
- escalate: the broken `isConfirmOwner()` helper as a real source-level authorization bug
- keep: this pair in a high-priority review bucket because the governance execution model changed materially

This case is useful because it shows both sides of manual review:

- some automated findings were too aggressive
- but a separate code-level issue surfaced once the new control model was read directly in source
