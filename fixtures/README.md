# Fixtures

Fixtures are small upgrade scenarios used to exercise the approval engine.

Each corpus entry contains:

- `current.json`
- `proposed.json`

The included `uups-admin-drift` case intentionally contains:

- a storage slot shift
- a weaker governance path
- a delay removal
- a weaker upgrade authorizer
- a new unguarded privileged function
- unsafe implementation initialization
- a new `delegatecall` signal

