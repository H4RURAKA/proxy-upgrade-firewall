# Automated Analysis Evidence

This directory contains public evaluation snapshots derived from local runs. The raw `reports/` directory stays git-ignored; the files here are the checked-in summaries and shortlists that support the repository claims.

## Included Snapshots

### Top 100

- snapshot date: `2026-03-25`
- live comparable summary: [top100/live-comparable-summary.json](top100/live-comparable-summary.json)
- historical upgrade summary: [top100/historical-summary.json](top100/historical-summary.json)
- suspicious shortlist: [top100/suspicious-pairs.csv](top100/suspicious-pairs.csv)

### Top 300

- snapshot date: `2026-03-26`
- live comparable summary: [top300/live-comparable-summary.json](top300/live-comparable-summary.json)
- historical upgrade summary: [top300/historical-summary.json](top300/historical-summary.json)
- suspicious shortlist: [top300/suspicious-pairs.csv](top300/suspicious-pairs.csv)

## Results

| Sample | Ready live proxies | Proxies with upgrade events | Proxies with actual pairs | Analyzed pairs | Suspicious pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| top100 | 16 | 15 | 10 | 27 | 11 |
| top300 | 56 | 51 | 22 | 50 | 19 |

## Interpretation

- The suspicious-pair rate stayed roughly stable as the sample expanded: `11 / 27 = 40.7%` in the top100 run and `19 / 50 = 38.0%` in the top300 run.
- That does not prove the heuristics are correct, but it is a useful sign that the analyzer is not obviously overfit to a handful of large-cap proxies from the smaller sample.
- The bigger bottleneck is still coverage, not ranking. In the top300 run only `56 / 300` contracts were ready for the full workflow because `221 / 300` had no reconstructible live implementation path and `18 / 300` lacked a Sourcify-verified implementation.
- These outputs are review shortlists, not confirmed vulnerability reports. Each suspicious pair still needs source review before making any security claim.

## Follow-up

- Existing manual case studies:
  - [../../docs/case-studies/usyc-pair-8.md](../../docs/case-studies/usyc-pair-8.md)
  - [../../docs/case-studies/usyc-pair-4.md](../../docs/case-studies/usyc-pair-4.md)
  - [../../docs/case-studies/wlfi-pair-1.md](../../docs/case-studies/wlfi-pair-1.md)
- Recommended next manual reviews from the top300 shortlist:
  - `plld` pair `2`
  - `rlusd` pair `1`
  - `usdtb` pair `1`

## Notes

- The copied summary JSON files preserve metadata from the original local runs, including `source` fields that point back to the local `reports/` paths used during generation.
