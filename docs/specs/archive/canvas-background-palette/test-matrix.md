# Canvas Background Palette Test Matrix

| Case | Requirements | Evidence | Status |
| --- | --- | --- | --- |
| P1 | R1 | contracts parser and JSON Schema tests accept solid/linear/radial and reject malformed stops, bounds and unknown fields | Passed |
| P2 | R2 | core command and engine API tests cover patch, null delete, history path and fail-closed behavior | Passed |
| P3 | R3 | renderer tests assert deterministic CSS, image stacking and full style cleanup | Passed |
| P4 | R4 | panel DOM/controller tests assert all modes, controls, stop limits and retained drafts | Passed |
| P5 | R5 | focused package checks and `pnpm verify:fast` | Passed |
