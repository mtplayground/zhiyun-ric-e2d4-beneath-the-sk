# Soft-tissue proxy

Generate the static asset with `npm run generate:soft-tissue`. This is an explicit
build-time precomputation; ordinary application builds use the checked-in binary.
The default input is the same FaceCap GLB configured by the application. No original
attachments were supplied (the original-files manifest is empty).

Options: `--source URL_OR_GLB_PATH`, `--output PATH`, `--target 3000`,
`--thickness-metres 0.012`, `--mouth-line -0.12`, `--metres-per-source-unit NUMBER`.
The target is an approximate tetrahedron budget; boundary topology means the actual
count differs. The committed proxy has 2,310 tetrahedra and 2,694 render embeddings.
Invalid/inverted layer cells fail generation rather than being silently omitted.
The requested 12 mm layer is never reduced automatically. The current generation
fails; the retained version 1 binary is deliberately rejected by the version 2
loader. It is not a regenerated 12 mm asset. See the recorded failure below.

The source must be a GLB v2 containing exactly one morph-bearing face primitive.
The neutral POSITION accessor defines render vertex order. Rigid eyes and teeth
are excluded. Coordinates are face-local, centered on the bounds and divided by
the maximum bound extent; the header stores the inverse transform. Mouth line
uses proxy units; thickness is specified in metres and converted once with the
shared `metresToProxyUnits` helper before offsetting. The generator composes matrix or TRS transforms along
all ancestors of the face instance in the active scene. glTF world up is +Y;
inverting the composed transform expresses that direction in face-local proxy
coordinates. Jaw nodes have a signed projection below the mouth line; all other
inner nodes are labeled skull for visualization. Outer nodes are labeled skin.
These labels are visualization metadata, not a pairing or mass definition. Ambiguous instances,
nonuniform scales, shear and singular transforms fail generation.

The `units` header stores `metresPerSourceUnit`, a unit `verticalAxis` vector in
proxy coordinates, measured world-horizontal width and world-vertical height in
metres, and `scaleSource` (`gltf` or `explicit`). Normalization remains separately
recorded as source-coordinate center and maximum extent. Width 0.10–0.25 m and
height 0.14–0.35 m are deliberately broad adult face plausibility bounds, not an
anatomical calibration. Without an explicit scale, either measurement outside
these bounds fails generation. Explicit positive finite overrides are recorded
even when outside the range; no automatic fitting is performed.

The upstream FaceCap scene implies roughly 1.90 m width and 2.31 m height. Its
physical calibration is ambiguous. The committed asset explicitly chooses
0.0000194938469 metres per source unit (one tenth of the scene-derived scale),
yielding width 0.1902732077 m and height 0.2312973010 m. This is a plausible
calibration assumption, not a measured subject dimension. Reproduce it with:

```sh
npm run generate:soft-tissue -- --metres-per-source-unit 0.0000194938469
```

Its derived up vector is approximately [-0.032701, 0.022088, -0.999221]; do not
replace it with an unsigned dominant axis. `metresToProxyUnits` and
`metresPerSecondSquaredToProxyUnits` in `src/domain/physics/physical-units.ts`
divide by `metresPerSourceUnit * normalization.scale`. Time stays in seconds.
These shared helpers are the entry point for future physical conversions.
The unit helper implementation is shared as an `.mjs` module so generation and
the TypeScript runtime use the same conversion code.

Edge collapse simplifies the surface. Normals are split at 30-degree creases before
inward extrusion, avoiding offsets across hard folds; smooth adjacent triangles
share nodes. Crease splits create independent layer boundaries, so this proxy is
not a watertight anatomical volume. Each ordered triangle prism uses a consistent
three-tetrahedron split. Positive volumes are checked on float32 node positions.
Embedding uses containment first, otherwise the exact closest point on the nearest
tetrahedron boundary with nonnegative barycentric weights. Nearest embeddings may
project vertices onto the proxy surface; they do not promise exact rest reconstruction.

Version 2 retains the STP1 container magic: four ASCII magic bytes, uint32 little-endian JSON header byte length,
UTF-8 JSON header, then packed sections. Header contains version, exact source GLB
SHA-256 (no normalization of bytes), normalization, physical units, generation options, counts and
section offsets relative to the payload. Sections are float32 XYZ nodes, uint32
four-index tetrahedra, uint32 two-index unique edges, uint8 node labels
(0 skin, 1 skull, 2 jaw), and float32 embedding records (tetrahedron index followed
by four weights), uint32 `pairs` records ([outer node, inner node]), and float64
`masses` (one positive mass in kilograms per node, including inner nodes). Every
node appears exactly once in `pairs`; consumers must not infer correspondence
from node ordering or labels. Header `counts.pairs` records table length,
`densityKgPerCubicMetre` is 1000, and `labelsPurpose` is `visualization-only`.

For each positively oriented tetrahedron, physical volume is
`det(b-a,c-a,d-a) / 6 * (metresPerSourceUnit * normalization.scale)^3`.
It contributes `volume * 1000 / 4` kg to each corner. Contributions accumulate
before serialization; masses are not inverse masses and are not zeroed for
inner nodes. Any attachment policy is separate from the stored physical mass.
Sections have no alignment padding. All multibyte values are
little-endian. The low-thousands tetrahedron budget keeps indices exactly
representable in embedding float32 records.

`loadSoftTissueAsset` checks the original GLB bytes and face vertex count before
returning the arrays. It rejects every header version other than 2 with an explicit
regeneration diagnostic, validates physical units, complete unique pairing and
positive finite SI masses. Legacy assets must be regenerated. Call it with the fetched source mesh bytes before using an
asset with a render mesh. The XPBD provider loads the simulation proxy on demand when physics is enabled;
the kinematic provider does not start a solver.

The 12 mm generation attempt at target 3000 failed before writing any output:

- Proxy triangle: 34, node indices [85, 86, 87].
- Nearest source triangle: 429, source indices [242, 234, 233]. Simplification
  changes topology, so this is a nearest-surface association, not exact lineage.
- Centroid in proxy coordinates: [0.0931976711, 0.2581272324, 0.2795516551].
- Centroid in source coordinates: [6719.666646, 10645.000112, 11570.999958].
- Outward triangle normal: [0.4417421180, 0.8796951608, 0.1760690922].
- Requested thickness: 0.012 m = 0.050920577164946065 proxy units.
- Reason: inverted or near-zero layer cell.
- Nearest facial region: unknown. No anatomical region annotations were supplied;
  anatomical labels such as nose or lip cannot be established from triangle IDs.

The exact diagnostic, source SHA-256, parameters and retained binary SHA-256 are
recorded in `docs/soft-tissue-generation-failure.json`. The generation command
above reproduces this failure. Geometry or supplied region annotations need to
be addressed before a valid replacement binary can be committed. No invalid
version 2 binary is emitted, and the old binary is not relabeled as version 2.

Offset validation also rejects collapsed/reversed inner triangles and proper
triangle crossings between inner/outer surfaces and among inner triangles.
Shared-edge touches are excluded from the crossing check; this is not a proof of
watertightness or a general coplanar surface Boolean test.

`npx vitest run scripts/generate-soft-tissue.test.mjs` covers the 12 mm offset on
simple valid geometry, explicit pairing, independently accumulated SI mass,
last-node mass, exact binary round-trip hashes, invalid units/pairs/masses,
legacy-version rejection, and reproduction of the recorded FaceCap failure.
The integrity case fetches the exact source, checks its byte SHA-256 and render
vertex count including the last vertex, and compares the complete diagnostic.
It also checks that the retained binary is unchanged and rejected. Network
access is required. Tests were added but not run in this implementation step.
No original-files directory or source mesh is copied into public assets.
