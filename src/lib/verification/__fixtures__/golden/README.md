# CLI golden envelopes

Copied byte for byte from `sigcomply-cli` `internal/sign/testdata/spa-golden/` (every file but
its README). Generated there by `TestSPAGoldenEnvelopes`. Never edit them by hand.

`golden.test.ts` checks that each envelope verifies, that its signed bytes equal
`<name>.canonical.txt`, that each manual PDF matches its record's hash, and that a one-byte change
fails. The CLI README describes each vector.

To refresh after a CLI change: in `sigcomply-cli`, run
`go test ./internal/sign/ -run TestSPAGoldenEnvelopes -update`, then here run
`npm run check:goldens -- --copy` and the gate. `npm run check:goldens` alone reports drift.
