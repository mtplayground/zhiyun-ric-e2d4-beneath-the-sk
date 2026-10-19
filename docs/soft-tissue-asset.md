# Soft-tissue proxy

Generate the static asset with `npm run generate:soft-tissue`. This is an explicit
build-time precomputation; ordinary application builds use the checked-in binary.
The default input is the same FaceCap GLB configured by the application. No original
attachments were supplied (the original-files manifest is empty).

Options: `--topology-report PATH` (default `docs/facecap-topology.json`), `--source URL_OR_GLB_PATH`, `--output PATH`, `--target 3000`,
`--thickness-metres 0.012`, `--mouth-line -0.12`, `--metres-per-source-unit NUMBER`.
The target is an approximate tetrahedron budget; boundary topology means the actual
count differs. The committed proxy has 2,310 tetrahedra and 2,694 render embeddings.
Invalid/inverted layer cells fail generation rather than being silently omitted.
The requested 12 mm layer is never reduced automatically. The current generation
fails; the retained version 1 binary is deliberately rejected by the version 3
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

Edge collapse simplifies the surface. Mechanical vertices are then welded using
position alone, with a Euclidean tolerance of 1e-6 normalized proxy units. The
weld checks neighboring spatial hash cells and ignores shading normal/UV
attributes. Area-weighted vertex normals are computed only after welding for the
inward offset. No physical cut boundaries are annotated on this skin, so no
mechanical splits are retained; sharp rendering features remain in the original
render geometry. Each ordered triangle prism uses a consistent three-tetrahedron
split. Positive volumes are checked on float32 node positions. See
`docs/forehead-seam.md` for the recorded before/after topology investigation.
Embedding uses containment first, otherwise the exact closest point on the nearest
tetrahedron boundary with nonnegative barycentric weights. Nearest embeddings may
project vertices onto the proxy surface; they do not promise exact rest reconstruction.

Version 3 retains the STP1 container magic: four ASCII magic bytes, uint32 little-endian JSON header byte length,
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
returning the arrays. It rejects every header version other than 3 with an explicit
regeneration diagnostic, validates physical units, complete unique pairing and
positive finite SI masses. Legacy assets must be regenerated. Call it with the fetched source mesh bytes before using an
asset with a render mesh. The XPBD provider loads the simulation proxy on demand when physics is enabled;
the kinematic provider does not start a solver.

The 12 mm generation attempt at target 3000 failed before writing any output:

- Proxy triangle: 0, node indices [7, 0, 2].
- Nearest source triangle: 7, source indices [3, 7, 9]. Simplification
  changes topology, so this is a nearest-surface association, not exact lineage.
- Centroid in proxy coordinates: [0.0127940003, 0.3591557046, 0.3017205695].
- Centroid in source coordinates: [5747.666669, 11866.333313, 11838.999965].
- Outward triangle normal: [-0.0933855608, 0.9842436946, 0.1501448853].
- Requested thickness: 0.012 m = 0.050920577164946065 proxy units.
- Reason: inverted or near-zero layer cell.
- Nearest facial region: unknown. No anatomical region annotations were supplied;
  anatomical labels such as nose or lip cannot be established from triangle IDs.

The exact diagnostic, source SHA-256, parameters and retained binary SHA-256 are
recorded in `docs/soft-tissue-generation-failure.json`. The generation command
above reproduces this failure. Geometry or supplied region annotations need to
be addressed before a valid replacement binary can be committed. No invalid
version 3 binary is emitted, and the old binary is not relabeled as version 2.

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

The physics panel stores SI settings: gravity acceleration in m/s² (default 9.81),
edge stiffness 10,000 N/m, skin pose stiffness 50 N/m, inner-layer pose stiffness
50,000 N/m, and damping 12 s⁻¹. Stiffness is converted to XPBD compliance by its
reciprocal at the settings boundary. Gravity is turned into a ratio of the host's
cached 9.81 m/s² vector, preserving the recorded axis and avoiding repeat length
conversion. Zero gravity is supported; pose stiffness remains positive and finite.

Telemetry records `nodePoseDistancesMetres` in node-index order, including the
last and all inner nodes. Maximum and mean residuals now use metres over every
node, independent of labels. The numeric readout has a node-index selector for
individual distances; the debug overlay draws each node-to-target residual and
keeps the three label colors for visual categorization only. No label implies a
jaw or skull attachment. Pose-target positions travel with each snapshot so the
residual corresponds to the submitted pose for that simulation output.

## Bounded embeddings (version 3)

Version 3 adds per-render-vertex sections: uint8 `embeddingFlags`, float32
`embeddingFade`, float64 `embeddingThickness`, and float64 `embeddingMaxOffsets`.
Thickness and caps use normalized proxy units. Flag bit 1 means outside the
simulated volume beyond tolerance; bit 2 means anatomically excluded. Both bits
may be set. The existing five-component embedding remains tetrahedron index plus
four **nonnegative, convex** barycentric weights. Weights are float32, so runtime
normalizes their sum to remove serialization roundoff. Extrapolation is rejected.
Version 1 and 2 assets are rejected with a version 3 regeneration diagnostic.

For an outside vertex, the generator finds the exact nearest point among all
four faces of every tetrahedron. It stores that clamped point's barycentric
weights. Inside or within 0.00001 m of the volume, fade is 1. Beyond that tolerance,
fade decreases linearly to zero over one local tissue thickness. Local thickness
is the convexly weighted distance between each contributing node and its
explicitly paired counterpart, including inner-node contributors.

Options are `--max-offset-fraction 0.5` (positive and at most 1),
`--outside-tolerance-metres 0.00001`, and `--fade-distance-thicknesses 1`.
Header `embeddingPolicy` stores all three values. The default maximum displacement
is half the local thickness (6 mm for a uniform 12 mm layer). Generation and
encoding fail if coefficients extrapolate or any cap exceeds this fraction of
the independently computed local thickness. The loader repeats validation on
serialized values, including the last record.

A finite displacement guarantee is impossible from weights alone when solver
node displacements are arbitrary. Rendering therefore fades the convex residual
and clips the resulting vector to the stored cap before reversing normalization.
It also guards against float32 rounding expanding the vector beyond that cap.
The bound is on the **simulation offset relative to the blendshape pose**; it
does not clamp the expression itself. This is a visual displacement limit, not a
solver collision constraint.

Render accessors at coincident/nearly coincident positions (the shared 1e-6 proxy
position tolerance) receive identical tetrahedron, weights, flags, fade, thickness
and cap records. If any copy is excluded, every copy is excluded, preventing a
render seam at a region boundary. Excluded vertices have zero fade and zero cap.
The pose-target mapper ignores excluded contributors and weights other
contributors by their fade.

Separate teeth and eye meshes are outside the selected morph-bearing face
primitive and never receive the offset attribute. Within the face primitive,
anatomical exclusions require an explicit `simulationRegions` array in primitive
or mesh extras, or a source-bound JSON file supplied as `--regions PATH`:

```json
{
  "sourceHash": "SHA-256 of the exact GLB bytes",
  "regions": ["skin", "teeth", "inner-mouth", "eyes"]
}
```

The example shows valid labels, not annotations for FaceCap. An actual file must
have one label per original POSITION accessor vertex, in order, with no missing,
unknown or ambiguous entries, including the last vertex. The importer checks the
GLB hash, full record count and every field, and records the raw annotation file's
SHA-256 in the generation options. It does not infer anatomy from position or
filenames, and does not copy annotation files or original attachments into public
assets. The annotation path/hash are recorded for deliberate reproduction.

No FaceCap anatomical annotations were supplied. Even after the existing 12 mm
inversion is repaired, region annotations are required before a valid bounded
asset can be emitted; inner-mouth vertices are not guessed. Regeneration still
fails at proxy triangle 0 (nearest source triangle 7), without thinning or
replacing the retained legacy binary. The failure report records both this
inversion and missing region annotations.

`scripts/bounded-embedding.test.mjs` covers exact nearest points, outside flags,
near-boundary tolerance, monotonic fade, anatomical exclusions, shared-position
records, source-hash/count/field validation, excessive bound rejection and exact
serialization hashes. Runtime tests cover arbitrary residual directions,
float32-safe caps, zero excluded offsets, and the last render vertex. The existing
upstream integrity test still reproduces the source-hashed failed generation and
retained binary hash. Tests/builds were not run in this implementation step.
