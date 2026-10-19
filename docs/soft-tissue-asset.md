# Soft-tissue proxy asset

Generate with:

```sh
npm run generate:soft-tissue -- --metres-per-source-unit 0.0000194938469
npm run verify:physics
```

The committed version 3 asset has **984 nodes, 492 pairs, 2,940 tetrahedra,
4,902 unique edges and 2,694 render embeddings**. Exact source and binary SHA-256
hashes and all counts are recorded in `facecap-asset-integrity.json`. The original
attachment manifest is empty; the source is the configured upstream FaceCap GLB.
No original-files directory or source GLB is published.

## Source-derived mechanical surface

The earlier generator simplified and offset every disconnected piece in the
morph-bearing primitive, including tiny oral pieces. At 12 mm, that surface
produced inverted layer cells. Its failure report is retained explicitly as
historical evidence, and tests still reproduce its location-specific rejection.
The layer thickness is never silently reduced.

For the exact recorded FaceCap source hash, the new profile computes connected
components after positional welding. The dominant component has 1,954 accessors;
the other 740 accessors are disconnected pieces. It also conservatively excludes
87 inward-facing accessors in the dominant component, using area-weighted source
normals dotted with the centered source position. Coincident accessors share the
same result. This leaves 1,867 eligible and 827 excluded render vertices.

These are **computed mechanical eligibility values**, not invented anatomical
names. The source has no per-vertex anatomical annotations. All detached oral
components and inward-facing folds receive zero offsets, including the final
render vertex. Eye and separate teeth primitives never receive the offset layer.
An exclusion on either copy of a coincident position excludes the entire group.
Excluded vertices also cannot drive the nearest-render pose-target fallback.
Unknown source bytes do not inherit this profile: they need explicit region data
or fail with a missing/ambiguous-input diagnostic. `--regions PATH` still accepts
source-hash-matched ordered `skin`, `teeth`, `inner-mouth`, and `eyes` annotations.

Uniform icosahedral directions intersect the convex envelope of eligible source
positions. This produces well-shaped, shared proxy triangles at a configurable
budget, rather than retaining tiny disconnected pieces or shading splits. The
default budget of 3,000 tetrahedra rounds to 2,940. It is a coarse mechanical
approximation that bridges openings and smooths concavities; it is not a detailed
anatomical tissue reconstruction. Fine shape remains in the unchanged render
mesh. Rendering adds only the bounded simulation-minus-pose residual, so this
proxy approximation does not replace or distort the zero-offset kinematic face.

## Units and full-thickness layer

Source POSITION accessor order is preserved, including the last vertex. Source
coordinates are centered and divided by their maximum bound extent. The header
records this normalization separately from physical units. Parent glTF TRS/matrix
transforms determine the full signed local world-up vector; it is approximately
[-0.032701, 0.022088, -0.999221], not an assumed unsigned dominant axis.

The upstream scene implies an implausible adult face size of approximately 1.90 m
wide and 2.31 m high. Generation fails without an explicit scale. The recorded
0.0000194938469 metres per source unit yields approximately 0.1903 m width and
0.2313 m height. This is an explicit plausible calibration assumption, not a
measured subject dimension. Shared helpers convert metres and m/s² exactly once
using `metresPerSourceUnit * normalization.scale`.

Each inner node is offset exactly 0.012 m along its proxy vertex normal. Every
outer/inner relationship is stored explicitly, independent of ordering or labels.
Each prism is split into three tetrahedra with consistent shared side diagonals.
Inverted, near-zero, folded or crossing layer geometry fails before output is
written; diagnostics include source/proxy triangle indices, centroid, normal and
requested thickness. Anatomical region remains unknown when not supplied.

Every positive tetrahedron contributes physical volume × 1,000 kg/m³ ÷ 4 to each
corner. Stored masses are positive SI kilograms for all nodes, including the last.
All nodes are dynamic. Labels 0/1/2 are visual colors only, not rigid attachments.

## Binary format and embedding

STP1 container: four ASCII magic bytes, uint32 little-endian JSON header length,
UTF-8 header, then packed sections with offsets relative to the payload. Version
3 is mandatory; versions 1/2 are rejected with a regeneration diagnostic. Header
fields include exact source hash, normalization, units, generation options,
mechanical selection policy, proxy-surface policy, counts and section offsets.

Sections: float32 XYZ `nodes`; uint32 four-index `tetrahedra`; uint32 two-index
`edges`; uint8 visual `labels`; float32 five-component `embedding` records (tet
index plus four weights); uint32 outer/inner `pairs`; float64 SI `masses`; uint8
`embeddingFlags`; float32 `embeddingFade`; float64 `embeddingThickness` and
`embeddingMaxOffsets`. Multibyte values are little-endian; no alignment padding.

Embedding searches containing tetrahedra, otherwise the nearest boundary point.
Weights are nonnegative convex weights; runtime normalizes float32 roundoff.
Vertices outside the layer beyond tolerance get a distance fade; excluded
vertices have zero fade and cap. Bit 1 flags outside-layer vertices and bit 2
flags excluded vertices. Positional copies get identical complete embeddings.
The cap is 0.5 times local tissue thickness by default (at most 6 mm here).
Generator and loader validate every bound. Runtime clips residuals and checks
that float32 rounding cannot expand an offset beyond its cap.

## Reproducible integrity and acceptance

`npm test` regenerates the entire committed binary from SHA-256-verified GLB bytes
and requires byte-for-byte equality with the recorded binary hash. It verifies
all counts, positive volumes, every 12 mm pair, all exclusion flags/fades/caps,
source topology, and the last mass and render embedding. Separate fixture tests
cover masses, units, invalid inputs, source mismatch, legacy rejection, convex
bounds, seam continuity and diagnostics. The historical invalid recipe must still
fail without thinning.

`npm run verify:physics` uses the production loader and independently checks
source bytes, every tetrahedron's SI mass contribution, every pair's thickness
and complete embeddings. `npm run test:e2e:physics` exercises the actual FaceCap,
worker, all expressions plus Smile/AA, zero-gravity pixel parity, finite values,
geometry/morph buffer identity and repeated off/on. Fixture browser cases are
separate and cannot substitute for the real source case.

`npm run build:static` also loads the committed binary through the same validator
used by the runtime loader. This offline gate pins the default FaceCap source
SHA-256 and 2,694 render vertices independently of the asset header, rejects any
runtime-invalid format or payload, and requires the built binary to match the
committed bytes exactly. The generator runs the runtime loader before replacing
the output file. Static-gate regression tests cover legacy versions, source/count
mismatches, truncated payloads, invalid final SI masses and altered build copies.
