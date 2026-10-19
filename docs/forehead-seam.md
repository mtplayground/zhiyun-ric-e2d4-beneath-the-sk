# Forehead seam investigation and correction

The historical simplified FaceCap surface had no disconnected coincident groups.
The former `toCreasedNormals(..., Math.PI / 6)` / `mergeVertices` pipeline created
404 groups, including 16 in the geometric forehead candidate region. Normals are
part of `mergeVertices`' key, so different shading normals split mechanical nodes
at the same position. This explains how crease edges could create the seam; it
is not an anatomical labeling of a particular screenshot pixel.

The forehead candidate is the upper 25% of vertical extent and central 60% of
horizontal extent. Both axes come from the actual glTF node transforms. Source
locations in diagnostics are nearest source associations because simplification
and resampling do not preserve exact triangle lineage.

The corrected generator shares mechanical nodes by position, independently of
render shading attributes. For the exact FaceCap source it uniformly resamples a
source-derived convex envelope, avoiding both tiny detached oral surfaces and
shading splits. The new `facecap-topology.json` records zero disconnected groups,
including the forehead, before and after mechanical welding. The regenerated
version 3 volume has 984 nodes and a full 12 mm inner layer. It does not retain
any crease-split mechanical edge. Render geometry and its shading remain original.
This is a coarse mechanical envelope, not a detailed anatomical surface.

The mapper pools contributors for coincident skin positions. Covered/uncovered
copies receive one displacement; uncovered nodes average tied eligible render
accessors. Excluded oral/inward-facing accessors cannot drive fallback targets.

`npm test` covers local-fan disconnections, spatial tolerance cell boundaries,
normal-independent welding, collapsed-edge rejection, a smooth forehead's
continuous offsets, coincident render embedding records and exact regenerated
FaceCap topology. Real-browser acceptance verifies all expressions, finite and
bounded output, zero-gravity canvas parity and intact mesh buffers across toggles.
The former inversion diagnostic remains historical evidence; it is no longer the
status of the committed asset.
