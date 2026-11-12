# FaceCap lip-gap regression

The browser test `e2e/lip-gap.spec.ts` loads the real default FaceCap GLB, checks
its SHA-256, and decodes its original quantized morph attributes with GLTFLoader
and MeshoptDecoder. It does not substitute a fixture mesh. Network/decoder/source
changes fail the test rather than skipping it.

Seven facing neutral inner-lip vertex pairs cover the center and both middle
sections, excluding mouth corners. The vertex IDs and hash live together in
`e2e/lip-gap-browser-probe.ts`. Upper and lower assignments follow the neutral
inner vermilion seam. Neutral gaps must be nonnegative and at most 3 mm; landmarks
are fixed before posing. The face's original world Y axis is pulled back into
accessor space and original glTF scale converts gaps to metres, independently
of viewport display scaling. A negative gap below -0.1 mm fails with both the
preset and lateral position. This is a sampled vertical crossing check, not a
complete triangle collision detector.

Every library preset and every binary endpoint combination of the mouth/jaw AU
sliders is included. Slider weights use additive basis accumulation clamped at
one, as in the control panel. CPU morph positions use the same exported
`computePosedSurfacePositions` function as the physics pose-target mapper,
including provider aliases, weight clamping, and relative/absolute morphs.

## Publisher validation and PR evidence

No results are claimed by implementation. When validation is authorized, run:

```sh
LIP_GAP_REPORT=/tmp/lip-experiment.json npx playwright test e2e/lip-gap.spec.ts
```

For the main comparison, the publisher should use an isolated checkout of the
current main revision, overlay this issue's test harness and shared CPU helper
without changing main's pose-library.ts, and run the identical command with
`LIP_GAP_REPORT=/tmp/lip-main.json`. Record the main and experiment commit SHAs.
Main may fail; the JSON is exported before assertions so failures remain useful
evidence. Do not loosen tolerance or change landmark selection for either run.

Then run the experiment with:

```sh
LIP_GAP_BASELINE=/tmp/lip-main.json LIP_GAP_REPORT=/tmp/lip-experiment.json npx playwright test e2e/lip-gap.spec.ts
```

The test attaches JSON with every pair's gap and `lip-gap-comparison.md` with a
row for each preset and slider mix, main/experiment minimum gaps in millimetres,
and pass/fail comparisons. Copy that generated table into the unmerged PR's
description together with both revision SHAs. A missing baseline is explicitly
reported as not run; mismatched source, pairs, tolerance, or case IDs fail.
