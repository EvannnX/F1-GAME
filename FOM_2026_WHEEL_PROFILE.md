# FOM 2026 Wheel Profile

## Status

Verified wheel profile for:

`src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb`

Strategy ID:

`fom-2026-material-v1`

The standalone verification GUI is:

`/?fomWheelTest=1`

The GUI and the race must both call `createFom2026WheelRigs` and
`updatePlayerWheelRigs` from `src/render/car.ts`.

## Base-model inheritance

Wheel behavior belongs to the GLB geometry, not to a livery ID.

`wheelStrategyForPlayerCar` in `src/data/playerCars.ts` forces every car entry
whose URL is the verified FOM base-model URL to use
`fom-2026-material-v1`.

Current inherited entries:

- `creator`
- `creator-special`

Future colors and liveries using the same base GLB inherit this profile
automatically. They must not add a second wheel detector or custom pivots.

## Rolling geometry

Only triangles using these materials enter a wheel pivot:

- `tread_medium`
- `sidewall`
- `livery_audi_01_wheel_hub`
- `hub_nut`
- `discs`

The triangles are split independently into:

- `left-front`
- `right-front`
- `left-rear`
- `right-rear`

Bodywork and aerodynamic parts must never enter these pivots.

## Front wheels

Each front wheel is calculated independently.

1. Isolate that wheel's `tread_medium` triangles.
2. Build an area-weighted covariance matrix from the tread triangle normals.
3. Use its smallest eigenvector as the cylindrical rolling axis.
4. Normalize the axis sign toward world positive X.
5. Project unique tread vertices onto the plane perpendicular to that axis.
6. Fit a two-dimensional circle to the projected vertices.
7. Use the fitted circle center and tread-width midpoint as the pivot center.

This preserves each front wheel's authored camber and toe while avoiding
vertex-density bias and visible eccentric wobble.

## Rear wheels

The verified rear-wheel calculation must remain unchanged:

1. Isolate each rear wheel's `sidewall` triangles.
2. Calculate area-weighted triangle normals.
3. Align inner and outer normals toward world positive X.
4. Suppress rounded shoulder and bead faces using lateral-normal weighting.
5. Use the isolated tire bounds center for the pivot.

The front cylinder fitting must not replace the verified rear calculation.

## Runtime transform

- Rolling uses `PLAYER_WHEEL_SPIN_RATE`.
- Front steering is composed by `updatePlayerWheelRigs`.
- Hubs, nuts and brake discs follow their wheel pivot.
- Internal wheel parts never participate in axis or center fitting.
- Preview and race use the same rig objects and update function.

## Regression checklist

1. The GUI reports exactly four wheel rigs.
2. Both front wheels roll without lateral wobble.
3. Both rear wheels retain their verified independent camber.
4. All four wheels roll in the same forward direction.
5. Steering affects only the front wheel assemblies.
6. Bodywork and aerodynamic pieces remain static during rolling.
7. `creator` and `creator-special` produce identical wheel motion.
8. A future livery using the same GLB URL inherits this profile automatically.
