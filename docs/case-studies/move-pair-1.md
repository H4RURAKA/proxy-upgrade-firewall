# Case Study: MOVE Pair 1

This note documents a manual review pass for the first MOVE historical upgrade pair from the top300 shortlist.

## Pair

- asset: `Movement`
- proxy: `0x3073f7aaa4db83f95e9fff17424f71d4751a3073`
- pair index: `1`
- current block: `20843299`
- proposed block: `24505881`
- current implementation: `0x1e1bf2adf28e2e0549ad2474f04f3e1b0de77e9c`
- proposed implementation: `0x2e2bc0e2920578e0d46d1f83787b01f1d8094695`
- current contract: `src/token/MOVEToken.sol:MOVEToken`
- proposed contract: `src/token/MOVETokenV2.sol:MOVETokenV2`
- automated verdict: `manual-review`
- automated risk score: `49`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `AUTH-007`
- `AUTH-008`
- `COMPILER-004`

At face value this looked like a large feature rollout with a changed authority surface.

## Manual Review

### 1. The biggest review point is the new reinitializer, not the role diff

The proposed implementation adds:

- `initialize(address _owner, address _revoke, address[] calldata _burned) external reinitializer(2)`

This function:

- grants `DEFAULT_ADMIN_ROLE`
- grants `PAUSER_ROLE`
- grants `UNPAUSER_ROLE`
- revokes `DEFAULT_ADMIN_ROLE` from `_revoke`
- burns balances from the supplied `_burned` list

That is more important than the raw `AUTH-007` / `AUTH-008` labels because it means the upgrade rollout depends on how initialization is executed.

If this reinitializer were left callable after the implementation upgrade, the first external caller could seize critical roles.

### 2. In this historical pair, the upgrade appears to have been executed atomically

The actual proposed upgrade transaction was:

- `0x3828a4574b5d60f31506801ebd77f0f5716b1672eb4aacff80f797f98dcc44c8`

On-chain receipt review shows the same transaction emitted:

- `Upgraded(...)`
- role-grant and role-revoke events
- burn events
- `Initialized(2)`

So this pair does not look like a live “forgot to initialize the upgraded proxy” failure. The rollout appears to have bundled upgrade and reinitializer execution together.

Manual conclusion:

- keep this as an operationally sensitive pattern
- do not claim a confirmed exploit from this historical pair alone

### 3. The role surface still changed materially

The proposed implementation adds:

- `PAUSER_ROLE`
- `UNPAUSER_ROLE`
- `pause()`
- `unpause()`

and introduces a LayerZero OFT bridge path through:

- `send(...)`

This is a meaningful control-plane and product-surface expansion.

### 4. This is a better case study for upgrade-process risk than for steady-state privilege loss

The automated output was directionally right that the admin model changed, but the more useful security lesson is:

- reinitializers that grant roles or change ownership should be treated as first-class review items
- they may be safe in practice if they are executed atomically
- they become a serious issue if rollout discipline fails

## Final Assessment

MOVE pair 1 is not a confirmed vulnerability on the evidence reviewed so far.

- keep: this pair in `manual-review`
- elevate: the unprotected `reinitializer(2)` as the main rollout risk
- note: the historical transaction appears to have mitigated that risk by combining upgrade and initialization
- do not treat: this pair as PoC-ready unless a non-atomic upgrade path is proven

This case is useful because it exposes an analyzer blind spot: initializer and reinitializer surfaces can matter more than ordinary role diffs during proxy upgrades.
