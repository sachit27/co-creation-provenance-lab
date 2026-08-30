# Tests

Regression tests for the v2 audit fixes (see `_version_archive/` for the pre-fix snapshot).

Run with Node 22+:

    npm test

Covers deterministic methodology guards, tier bands, export escaping, source
span verification, affective-fidelity transitions and denominators, core math,
and counterfactual-utility/Shapley estimators.

Exit code 0 = all checks passed.

3. **HTML export escaping** — untrusted participant text, dataset names and
   model output must be neutralised in `reportExport.ts` and
   `participantVerification.ts`, including the `</script>` breakout case in
   script-context JSON.
4. **Threshold single source of truth** — `constants.ts` is canonical;
   no duplicate threshold literals may reappear in `App.tsx` or
   `ThresholdSliders.tsx`.
5. **Affective-fidelity validity guards** — exact-span verification, strict
   structured-profile parsing, target-aware deterministic transitions,
   affect-bearing denominators, deduplication, uncertainty handling, and
   threshold sensitivity.

The runner first generates the ignored `tests/.modules/` compatibility shim
from the real source, then executes every `*.test.ts` file and stops on failure.
