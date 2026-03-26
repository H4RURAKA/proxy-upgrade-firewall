# Case Study: frxUSD Pair 1

## Pair

- asset: `Frax USD`
- proxy: `0xcacd6fd266af91b8aed52accc382b4e165586e29`
- pair index: `1`
- current block: `21543360`
- proposed block: `23077271`
- current implementation: `0xa8f9e149cce34ec7f68af720d8551cb9b39ed1f1`
- proposed implementation: `0x000000003c7f01b12c2d2097cf7b95358e7e5812`
- current contract: `src/contracts/FrxUSD.sol:FrxUSD`
- proposed contract: `src/deps/FrxUSD.sol:FrxUSD`
- automated verdict: `manual-review`
- automated risk score: `44`

## Automated Signals

The automated pass flagged this pair for:

- `ABI-001`
- `COMPILER-002`
- `COMPILER-001`
- `COMPILER-004`
- `STORAGE-002`

At face value this looked like a moderate feature expansion with appended state.

## Manual Review

### 1. The new powers are explicit owner powers, not lost guards

The proposal adds owner-controlled methods such as:

- `freeze(...)`
- `freezeMany(...)`
- `thaw(...)`
- `thawMany(...)`
- `burn(...)`
- `burnMany(...)`
- `pause()`
- `unpause()`

These are highly centralized controls, but they are also clearly:

- `onlyOwner`

So this pair is not a hidden privilege loss case. It is a visible expansion of admin authority.

### 2. The transfer model changed from unrestricted ERC20 to compliance-gated ERC20

The proposal adds:

- `isFrozen`
- `isPaused`

and overrides `_update(...)` so that non-owner callers are blocked when:

- the token is paused
- sender/recipient/caller is frozen

That is a major policy shift, but it reads as intentional compliance logic rather than a bug.

### 3. The old minter model stayed intact

The original non-bridge minter system remains:

- `minters_array`
- `minters`
- `addMinter(...)`
- `removeMinter(...)`
- `minter_mint(...)`
- `minter_burn_from(...)`

The new logic adds compliance controls around it rather than destabilizing it.

### 4. This pair is more about trust model than exploitability

The right security interpretation is:

- stronger central admin powers
- more operational control over balances
- more potential for censorship and emergency intervention

That may matter a lot from a product-risk perspective, but it is not a straightforward exploit candidate.

## Final Assessment

frxUSD pair 1 is not a strong exploit case.

- keep: this as a trust-model and admin-surface expansion
- downgrade: any framing that implies a hidden authorization bug
- classify: this as `design-risk / centralized control expansion`
- do not treat: this as PoC-worthy on current evidence
