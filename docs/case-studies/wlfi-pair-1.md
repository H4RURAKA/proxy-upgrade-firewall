# Case Study: WLFI Pair 1

This note documents the third manual review pass in the historical-upgrade shortlist.

## Pair

- asset: `World Liberty Financial`
- proxy: `0xda5e1988097297dcdc1f90d4dfe7909e847cbef6`
- pair index: `1`
- current block: `20857295`
- proposed block: `23207432`
- current implementation: `0x3722359be0bfebb541bc98adfe1250cd901a706c`
- proposed implementation: `0x0959a6eaea3c23148fe69ddd703c277bc6ad79cc`
- current contract: `contracts/WorldLibertyFinancial.sol:WorldLibertyFinancial`
- proposed contract: `contracts/wlfi/WorldLibertyFinancialV2.sol:WorldLibertyFinancialV2`
- automated verdict: `manual-review`
- automated risk score: `51`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `ABI-002`
- `ABI-003`
- `COMPILER-001`
- `COMPILER-003`
- `COMPILER-004`

Unlike the USYC cases, this pair had no storage, authority, or implementation-safety findings. The review question here is not "did a guard disappear?" but "did a large feature rollout add risky new privileged surface?"

## Manual Review

### 1. The added mutable surface is real, but it is structured

The proposed implementation adds many state-changing entrypoints, but they fall into clear buckets.

Owner-only administration:

- `ownerPause()`
- `ownerUnpause()`
- `ownerSetAuthorizedSigner(address)`
- `ownerSetGuardian(address,bool)`
- `ownerSetMaxVotingPower(uint256)`
- `ownerSetTransferBeforeStartStatus(address,bool)`
- `ownerSetVotingPowerExcludedStatus(address,bool)`
- `ownerRescueTokens(address,address,uint256)`
- `ownerReallocateFrom(address,address,uint256)`
- `ownerSetBlacklistStatus(address,bool)`
- `ownerActivateAccount(address,bool)`
- `ownerClaimVestFor(address)`

Guardian-only controls:

- `guardianPause()`
- `guardianSetBlacklistStatus(address,bool)`

User-facing flows:

- `activateAccount(bytes)`
- `activateAccountAndClaimVest(bytes)`
- `claimVest()`

Manual conclusion:

- `ABI-001` is valid as a review signal
- but it does not read like accidental surface sprawl or a missing-guard incident
- it reads like a deliberate V2 expansion that split the system into owner, guardian, and user workflows

### 2. The privileged functions appear explicitly gated

The current implementation already had a strong owner-controlled admin surface:

- `setGuardian(...)` is `onlyOwner`
- `setMaxVotingPower(...)` is `onlyOwner`
- `setAllowListStatus(...)` is `onlyOwner`
- `setExcludedAddress(...)` is `onlyOwner`
- `rescueTokens(...)` is `onlyOwner`
- `pause()` allows `owner()` or an approved guardian

The proposed implementation keeps the same basic control model and makes it more explicit:

- owner-only functions use `onlyOwner`
- guardian-only functions use `onlyGuardian`
- claim and activation flows are gated by `whenNotPaused`

Manual conclusion:

- this pair does not show the kind of hidden authority regression seen in stronger candidates
- the new power surface is large, but the role boundaries are readable in source

### 3. The new activation and vesting model explains much of the ABI growth

The proposed V2 introduces an account-activation and vesting flow that did not exist in the current contract.

Key pieces:

- `authorizedSigner` is set during `initialize(address _authorizedSigner)` via `reinitializer(2)`
- `activateAccount(bytes)` validates a signed activation payload
- `activateAccountAndClaimVest(bytes)` combines activation with claiming
- `claimVest()` and `ownerClaimVestFor(address)` integrate with the external vester
- `ownerReallocateFrom(...)` and `ownerActivateAccount(...)` support legacy-user migration and recovery operations

Manual conclusion:

- most of the ABI delta is product and lifecycle logic, not arbitrary new governance hooks
- this is consistent with a migration from a simpler transfer-restricted token into a token plus registry/vester system

### 4. There are still centralization and review questions

Even though this pair does not look like a hidden bug, there are still meaningful governance questions:

- guardians can now blacklist accounts
- the owner can reallocate balances between accounts
- the owner can activate user accounts and claim vesting on behalf of users
- the token now depends on an `authorizedSigner`, a registry contract, and a vester contract

These are not automatically bad, but they are important changes in trust assumptions.

Manual conclusion:

- this pair belongs in `manual-review`
- but as a governance and product-surface review
- not as a likely exploit or broken-upgrade candidate

### 5. The compiler findings look contextual, not suspicious

The automated pass also flagged:

- compiler version change: `0.8.25 -> 0.8.24`
- optimizer settings change
- bytecode size increase

Given the source diff, those changes are easy to contextualize:

- the proposed implementation is a different source tree
- it introduces registry/vester interfaces and EIP-712 activation logic
- it uses a different OpenZeppelin import layout

Manual conclusion:

- the compiler findings should remain as review metadata
- they do not independently suggest a dangerous upgrade in this case

## Final Assessment

WLFI pair 1 is a good baseline manual-review case.

- keep: `ABI-001` as a useful signal that the privileged and user-facing surface changed substantially
- keep: the pair in `manual-review` because the trust model expanded
- downgrade: any interpretation that this pair is an obvious vulnerability candidate
- treat: the compiler findings as supporting context rather than primary risk

Compared with the two USYC cases, this pair looks more like a legitimate V2 rollout than a suspicious upgrade. It is still worth reviewing carefully, but the review focus is governance design and operational power, not a missing guard or storage break.
