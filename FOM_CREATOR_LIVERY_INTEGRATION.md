# FOM Creator Livery Integration

## Selectable cars

Both entries use:

`src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb`

The GLB is imported once. The garage caches its raw bytes by URL and keeps at
most one parsed FOM scene resident; switching between the two entries replaces
only the active presentation instead of retaining two base-model instances.

| Car ID | Display name | Runtime appearance |
| --- | --- | --- |
| `creator` | 创变者 | Base NYU-purple model, no runtime logos |
| `creator-special` | 抖音AI创变者计划2026特涂 | Full runtime decals and blinking rear light |

The special livery configuration is implemented in
`src/render/fomSpecialLivery.ts`. All decal geometry is exported directly from
the original v54 preview after that preview has run its own mapping code.

## Prebaked curved decals

Runtime raycasting is forbidden for this livery. Geometry must not be rebuilt
with a replacement projection algorithm. When the FOM GLB or mapping changes,
serve the project locally, start Chrome with remote debugging on port 9223,
then run:

```bash
npm run extract:fom-v54
```

This opens `fom-decal-preview.html?export-decals=1`, waits for the original
v54 `GLTFLoader`, `Raycaster`, retry offsets, closest-surface fallback and
triangle filtering to finish, then writes:

- `src/generated/fom/decal-geometries.json`: curved positions, normals, UVs
  and triangle indices for all 19 decals.

No alternate mapping, spatial projection or placement approximation is
permitted. `npm run bake:fom-livery` only regenerates:

- `src/generated/fom/rear-logo-white.png`: white rear-wing lettering with the
  original alpha mask.

The showroom preloads decal textures in the background. Selecting the special
livery only attaches the prebaked, single-sided meshes; it performs no surface
raycasts and does not rebuild decal geometry.

## v54 color schemes

The special-livery garage entry exposes all eight original v54 same-surface
schemes: `clean`, `classic`, `silver`, `orange`, `blueArrow`, `violetGold`,
`greenCut`, and `silverSpine`. Their primary/accent colors and
`installLiveryPartitionShader` masks are copied from the v54 source. Selection
is persisted under `f1ti_fom_livery_scheme_v54` and is applied unchanged to the
race model. These schemes recolor the existing body material; they do not add
decal geometry.

The plain `creator` entry separately exposes the original v50 ten-color theme
palette. It changes only `livery_audi_01`, `fom_car_dummy_decal`, and `boya`;
no logos or partition shader are attached. The chosen color is persisted under
`f1ti_fom_theme_color_v50` and applied to the race model.

## Wheel profile

Strategy ID: `fom-2026-material-v1`

Canonical calibration record: `FOM_2026_WHEEL_PROFILE.md`

The FOM GLB does not provide four semantic wheel nodes. Its tire meshes span
multiple wheels, so the game splits triangles into four wheel slots by their
model-space side and axle before creating pivots.

Only these material names may enter a rolling wheel pivot:

- `tread_medium`
- `sidewall`
- `livery_audi_01_wheel_hub`
- `hub_nut`
- `discs`

Front and rear wheels intentionally use different geometry references. Each
front axis is the smallest eigenvector of the area-weighted triangle-normal
covariance of that wheel's isolated `tread_medium` cylindrical surface. This
avoids bias from duplicated vertices and uneven local tessellation while
preserving authored camber and toe. Each rear axis comes from area-weighted
face normals of that wheel's isolated `sidewall` triangles; inner and outer
normals are aligned before averaging and rounded shoulder/bead faces are
suppressed. Each front pivot center is fitted as a circle after projecting its
unique tread vertices onto the plane perpendicular to its detected cambered
axis; its axial coordinate is the midpoint of the tread width. Rear centers
retain the verified isolated-tire bounds center.
Hubs, nuts and brake discs follow the resulting pivot but never participate in
its axis or center calculation. Front wheels receive steering around the
existing game Y axis after rolling meshes have been isolated. Do not flatten
these axes to a shared world X axis and do not reuse the old `tripo_part_*`
Creator profile.

The standalone wheel GUI is available at:

`/?fomWheelTest=1`

The GUI and the race both call `createFom2026WheelRigs` for wheel extraction
and `updatePlayerWheelRigs` for steering and rolling. The preview must not keep
a separate wheel transform implementation.

## Regression checks

1. Both garage entries load the same purple base model.
2. `creator` has no added logos.
3. `creator-special` shows front, side, sponsor, DeltaX and rear decals.
4. The special rear light alternates red/original every 250 ms.
5. All four wheels roll; bodywork remains static.
6. A model swap must produce exactly four wheel rigs.
7. The wheel GUI reports `4/4` and matches the race at the same speed and steer.
