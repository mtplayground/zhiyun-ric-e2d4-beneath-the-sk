# FaceCap lip-gap regression

The browser test `e2e/lip-gap.spec.ts` loads the real default FaceCap GLB, checks
its SHA-256, and decodes the original quantized morph attributes with GLTFLoader
and MeshoptDecoder. It does not substitute a fixture mesh. Changed source bytes
fail instead of skipping.

The fixed neutral selection in `e2e/facecap-lip-regions.ts` contains 40 upper and
32 lower triangles, including outer rolls but excluding shared commissures.
`inspectLipSurfaces` computes unsigned 3D triangle clearance and tests surface
intersection, including coplanar contact. This supersedes the earlier sampled
vertical vertex-pair description. Every library preset and every binary endpoint
combination of mouth/jaw AU sliders is included. Slider weights accumulate
additively and clamp at one, matching the control panel. CPU positions use the
shared `computePosedSurfacePositions` calculation.

The existing regression requires no intersection and 0.1 mm positive clearance
for explicitly designated open-mouth cases. Neutral needs no positive minimum.
Those assertions are separate from issue #147's descriptive baseline measurement;
no thresholds or poses were changed by #147.

See [neutral versus T profile measurements](lip-profile.md) for both profile
images, regional gaps, forward extents, projected overlap, source hash, selection
limits, complete JSON results, and reproducible capture/integrity commands.
Neutral already has a forward overhang and overlapping side projections without
3D intersection in the selected surfaces. Later T issues should compare against
neutral rather than infer penetration from side-view occlusion.

## Deferred publisher validation

No regression results are claimed during implementation. When batch validation
is authorized, export the complete per-preset JSON before assertions with:

```sh
LIP_GAP_REPORT=/tmp/lip-experiment.json npx playwright test e2e/lip-gap.spec.ts
```

An optional `LIP_GAP_BASELINE=/path/to/report.json` checks matching source bytes,
triangle selections, minimum-open-gap threshold and case IDs. This baseline
option checks comparable inputs; it does not generate a main/experiment table.
