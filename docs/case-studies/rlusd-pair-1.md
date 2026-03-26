# Case Study: RLUSD Pair 1

## Pair

- asset: `Ripple USD`
- proxy: `0x8292bb45bf1ee4d140127049757c2e0ff06317ed`
- pair index: `1`
- current block: `20492031`
- proposed block: `23300630`
- current implementation: `0xcfd748b9de538c9f5b1805e8db9e1d4671f7f2ec`
- proposed implementation: `0x9747a0d261c2d56eb93f542068e5d1e23170fa9e`
- current contract: `StablecoinUpgradeable.sol:StablecoinUpgradeable`
- proposed contract: `src/main/contracts/eth/StablecoinUpgradeableV2.sol:StablecoinUpgradeableV2`
- automated verdict: `manual-review`
- automated risk score: `100`

## Automated Signals

The automated pass flagged this pair for:

- `AUTH-003`
- `AUTH-006`
- `AUTH-010`
- `AUTH-005-unpauseaccount-address`
- `AUTH-005-upgradetoandcall-address-bytes`
- `ABI-001`
- `COMPILER-002`

At face value this looked like the V2 upgrade had lost its `_authorizeUpgrade` hook and several role guards.

## Manual Review

### 1. The upgrade-authority findings are false positives

The proposed V2 implementation inherits from:

- `src/main/contracts/eth/StablecoinUpgradeable.sol`

That base contract still contains:

- `_authorizeUpgrade(address) internal virtual override onlyRole(UPGRADER_ROLE) {}`
- `unpauseAccount(address) public virtual onlyRole(PAUSER_ROLE)`
- `pause()` / `unpause()` / `pauseAccounts(...)` all behind `onlyRole(PAUSER_ROLE)`

The UUPS entrypoint still routes through `_authorizeUpgrade(...)` via OpenZeppelin `UUPSUpgradeable`.

Manual conclusion:

- downgrade `AUTH-003`
- downgrade `AUTH-006`
- downgrade `AUTH-010`
- downgrade `AUTH-005-unpauseaccount-address`
- downgrade `AUTH-005-upgradetoandcall-address-bytes`

The automated pass is missing the inherited base guard path here. This pair is a good example of why inheritance-aware authority resolution matters.

### 2. The V2 logic is a feature expansion, not an obvious privilege regression

The proposed implementation adds:

- `reinitializeV2()` to bootstrap `ERC20Permit`
- `permit(...)`
- `initializeV2(...)`

It also overrides account-pausing behavior so that:

- minting, burning, clawback, and permit flows can apply account-level pause checks more consistently

This is a substantial feature rollout, but the explicit role model from V1 appears intact:

- `MINTER_ROLE`
- `UPGRADER_ROLE`
- `PAUSER_ROLE`
- `BURNER_ROLE`
- `CLAWBACKER_ROLE`

### 3. The initializer surface deserves review, but not for the reason the automated pass claimed

The proposed code includes both:

- `reinitializeV2()` with `reinitializer(2)`
- `initializeV2(...)` with `initializer`

That is unusual enough to deserve human review, but it is different from “the upgrade authorizer disappeared.” In context, this reads more like deployment and migration scaffolding than a missing `_authorizeUpgrade` path.

### 4. The remaining signals are still useful review metadata

Even after discounting the authority false positives, the pair still changed meaningfully:

- compiler `0.8.26 -> 0.8.29`
- `viaIR` enabled in the proposed build
- bytecode size increase from `8229` to `14055`
- added permit and account-pausing logic

That is enough to keep the pair in `manual-review`, but not enough to support a “weakened upgrade auth” claim.

## Final Assessment

RLUSD pair 1 is not a strong true-positive authority case.

- downgrade: the upgrade-authority regression interpretation
- keep: the pair in `manual-review` because the feature set and code-generation profile changed materially
- treat: this as an inheritance-resolution blind spot in the analyzer, not as evidence that RLUSD exposed an unguarded upgrade path
