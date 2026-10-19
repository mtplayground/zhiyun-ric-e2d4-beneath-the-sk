# Forehead seam investigation

The forehead check finds a crease-induced mechanical split. At target 3000,
the simplified FaceCap surface has no disconnected coincident vertex groups.
Applying the previous `toCreasedNormals(..., Math.PI / 6)` followed by
`mergeVertices` creates 404 groups, including 16 in the forehead check.
`mergeVertices` compares normals as well as positions, so differing shading
normals prevent these coincident nodes from sharing mechanical connectivity.
Two triangle fans can be disconnected locally even if a distant path joins them
in the same global component; the report checks both facts.

The forehead check is explicitly a geometric candidate region: the upper 25% of
the face's vertical extent, restricted to the central 60% of horizontal extent.
Both axes come from the glTF node transforms. There are no anatomical annotations
or supplied screenshot coordinates identifying the exact visible seam. Thus the
forehead region does contain crease-split edges, and these can produce the
reported seam, but matching a particular rendered pixel to an edge remains
unverified. No visual verification was performed in this implementation step.

For example, old proxy vertices [292, 317, 319, 1101, 1102] all lie at proxy
[-0.154520646, 0.320663422, -0.279303491], corresponding approximately to source
[3725, 11401, 4815], nearest original accessor vertex 776. The report includes all
groups, exact float positions, nearest source accessor indices, global component
IDs and forehead membership. Source associations are labeled as nearest matches,
since simplification does not preserve exact source vertex/triangle lineage.

| Generation stage | Disconnected coincident groups | Forehead candidate groups |
| --- | ---: | ---: |
| Before normal splitting | 0 | 0 |
| Previous crease/merge pipeline | 404 | 16 |
| Position-welded mechanical surface | 0 | 0 |

The mechanical surface now welds positions independently of normal attributes,
then computes a shared area-weighted offset normal. Neighboring triangles in
smooth forehead regions reference the same outer node and its one explicitly
paired inner node. The simulation skin has no annotated physical cuts requiring
a sharp-feature split, so no shading-induced mechanical splits are kept. The
original rendered geometry retains its own shading features. Welding a tiny
real edge into a degenerate triangle fails rather than silently dropping it.

The generator detects coincident and near-coincident vertices within 1e-6 proxy
units using Euclidean distance, including pairs across spatial hash cell
boundaries. It reports disconnected local fans with their source locations and
fails if any remain after welding. The topology report is written before layer
generation, so offset failure cannot hide the investigation. It stays under
`docs/`, outside the published static assets.

The pose-target mapper also pools embedding contributors for coincident skin
positions. Covered and uncovered copies receive one shared displacement. If no
copy has contributors, the entire group uses the same nearest-render fallback;
equidistant/duplicated render accessors are averaged. This avoids an arbitrary
accessor-order choice giving two sides different target offsets. The fallback
is defensive; it cannot substitute for shared mechanical topology.

Reproduce the reports and attempt the mandatory layer generation with:

```sh
npm run generate:soft-tissue -- --metres-per-source-unit 0.0000194938469
```

`facecap-topology.json` records the exact source SHA-256 and before/after source
locations. `soft-tissue-generation-failure.json` records the current 12 mm offset
failure at proxy triangle 0, nearest source triangle 7. The requested thickness
remains 0.012 m; the invalid layer is not saved. Consequently the committed
binary is still the old version 1 binary and is rejected by the version 2 loader.
The surface topology fix is implemented, but a valid regenerated volume and
visible forehead continuity remain blocked by that offset inversion.

Regression tests in `scripts/forehead-topology.test.mjs` cover disconnected local
fans, nearby positions, attribute-independent welding and collapsed-edge failure.
The source integrity test checks the upstream byte hash, all recorded topology
fields, source accessor count and last vertex, the exact generation diagnostic,
and the unchanged retained binary hash. Mapper tests cover covered/uncovered
copies and tied render fallback. Tests and builds have not been run here.
