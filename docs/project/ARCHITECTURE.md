# Architecture

## Inputs

The project supports four input paths:

- fixture directories with `current.json` and `proposed.json`
- Hardhat build-info files or artifacts
- Foundry artifacts with embedded `storageLayout` and metadata
- live proxies resolved over JSON-RPC and Sourcify

## Pipeline

`check` loads a current implementation and a proposed implementation, normalizes both into a shared contract model, and runs these analyzers:

1. `storage-layout`
2. `authority-diff`
3. `implementation-safety`
4. `abi-surface`
5. `compiler-metadata`

Each analyzer emits findings with:

- `id`
- `category`
- `severity`
- `title`
- `body`
- `evidence`
- `recommendation`
- `tags`

The findings then flow into:

- a summary and risk score
- a verdict (`allow-with-review`, `manual-review`, or `block`)
- Markdown or JSON output

## Live Inspection

`inspect` follows a separate path:

1. read EIP-1967 implementation, admin, and beacon slots
2. classify the proxy type
3. inspect the admin or owner control path
4. render the on-chain context as Markdown or JSON

## Historical Exploration

`scripts/explore-historical-upgrades.mjs`:

1. finds deployment blocks for ready live proxies
2. scans `Upgraded(address)` events
3. builds historical implementation pairs
4. resolves verified source bundles from Sourcify
5. runs the analyzer on each pair
6. writes pair summaries and review candidates to `reports/`
