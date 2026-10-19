# Soft-tissue proxy

Generate the static asset with `npm run generate:soft-tissue`. This is an explicit
build-time precomputation; ordinary application builds use the checked-in binary.
The default input is the same FaceCap GLB configured by the application. No original
attachments were supplied (the original-files manifest is empty).

Options: `--source URL_OR_GLB_PATH`, `--output PATH`, `--target 3000`,
`--thickness 0.001`, `--mouth-line -0.12`, `--up-axis 2`.
The target is an approximate tetrahedron budget; boundary topology means the actual
count differs. The committed proxy has 2,310 tetrahedra and 2,694 render embeddings.
Invalid/inverted layer cells fail generation rather than being silently omitted.
If an alternative mesh fails, reduce thickness or increase the target.

The source must be a GLB v2 containing exactly one morph-bearing face primitive.
The neutral POSITION accessor defines render vertex order. Rigid eyes and teeth
are excluded. Coordinates are face-local, centered on the bounds and divided by
the maximum bound extent; the header stores the inverse transform. Thickness and
mouth line use those units. FaceCap's face-local vertical axis is Z (axis 2), before
scene transforms. Jaw nodes lie below the mouth line; all other inner nodes attach
to the skull. Outer nodes are skin. For other meshes choose their vertical axis
and mouth line explicitly. No anatomical boundary is inferred from filenames.

Edge collapse simplifies the surface. Normals are split at 30-degree creases before
inward extrusion, avoiding offsets across hard folds; smooth adjacent triangles
share nodes. Crease splits create independent layer boundaries, so this proxy is
not a watertight anatomical volume. Each ordered triangle prism uses a consistent
three-tetrahedron split. Positive volumes are checked on float32 node positions.
Embedding uses containment first, otherwise the exact closest point on the nearest
tetrahedron boundary with nonnegative barycentric weights. Nearest embeddings may
project vertices onto the proxy surface; they do not promise exact rest reconstruction.

STP1 format: four ASCII magic bytes, uint32 little-endian JSON header byte length,
UTF-8 JSON header, then packed sections. Header contains version, exact source GLB
SHA-256 (no normalization of bytes), normalization, generation options, counts and
section offsets relative to the payload. Sections are float32 XYZ nodes, uint32
four-index tetrahedra, uint32 two-index unique edges, uint8 node labels
(0 skin, 1 skull, 2 jaw), and float32 embedding records (tetrahedron index followed
by four weights). Sections have no alignment padding. All multibyte values are
little-endian. The low-thousands tetrahedron budget keeps indices exactly
representable in embedding float32 records.

`loadSoftTissueAsset` checks the original GLB bytes and face vertex count before
returning the arrays. Call it with the fetched source mesh bytes before using an
asset with a render mesh. The XPBD provider loads the simulation proxy on demand when physics is enabled;
the kinematic provider does not start a solver.

`npx vitest run scripts/generate-soft-tissue.test.mjs` exercises geometry, attachment
labels, embedding completion, source/count mismatch rejection, and byte-for-byte
regeneration of the committed binary including the last render vertex. The integrity
test fetches the recorded upstream source, checks its exact SHA-256, and fails if
it changes; network access is required. Regenerate deliberately when changing the
source. No source mesh or original-files directory is copied into public assets.
