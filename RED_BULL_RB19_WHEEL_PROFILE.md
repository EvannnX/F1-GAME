# Red Bull RB19 Wheel Profile

Last verified: 2026-07-25

This file records the known-good wheel configuration for the Red Bull RB19.
Do not reuse this profile for Mercedes, Ferrari, or McLaren. Each car owns an
independent wheel strategy.

## Protected Asset

- Car ID: `redbull`
- Wheel strategy: `redbull-github-v1`
- Model: `src/assets/models/RB19_REDBULL.opt.glb`
- Model SHA-1: `66c78ca97b11d3cbaf20f2bf9c7eec7a2614d3ae`
- Source baseline commit: `ccc253bf5cbd7e2f09d981eb813ac69071bffc26`
- Wheel function SHA-1:
  `a617e4b221e1e51090e3272b1d0171bfbda3518e`
- Profile revision:
  `2026-07-25-independent-rear-tire-camber-axes`

If the model is replaced or re-exported, its connected components, vertex
order, wheel centers, and principal axes may change. Recalibrate this profile
instead of changing another car's wheel strategy.

## Main-Game Integration

The test page and the normal race use the same implementation:

1. The garage selects car ID `redbull`.
2. `src/data/playerCars.ts` resolves `RB19_REDBULL.opt.glb` and the
   `redbull-github-v1` strategy.
3. `createCar().setCarModel('redbull')` loads and fits the GLB.
4. `createPlayerWheelRigs()` dispatches to `createRedBullWheelRigs()`.
5. `splitRedBullWheelComponents()` supplies the rolling and steering groups.

There must not be a second Red Bull wheel implementation in the test UI.
`src/ui/mercedesWheelTest.ts` calls the same `createCar()` path as the race.

## Known-Good Geometry Rules

- Split the shared wheel meshes into four slots by rendered triangle position.
- Keep front-wheel rolling and steering geometry on nested pivots.
- Preserve the current front-wheel calculation; both front wheels were
  visually confirmed correct on 2026-07-25.
- Calculate each rear wheel independently. Do not mirror one rear wheel onto
  the other and do not force either rear axis to world X.
- Fit each rear axle from the ring geometry using these materials:
  - `Material_105`
  - `Material_97`
  - `Material_102`
- Exclude `REAR_RIMS` from rear-axle PCA. In this GLB its smallest principal
  axis is almost vertical, around `88.5deg`, and corrupts the rolling axis.
- `REAR_RIMS` remains visible and rotates with the complete wheel assembly; it
  is excluded only from axle calculation.

## Verified Rear Axes

The current protected model produces approximately:

| Wheel | Camber component | Toe component |
|---|---:|---:|
| Left rear | `-1.49deg` | `0.00deg` |
| Right rear | `+1.49deg` | `0.00deg` |

These values are geometry-derived rather than hard-coded. Small numerical
differences are acceptable only when the protected model remains byte-identical
and the wheels still rotate around a stable single axis.

## Animation Parameters

- Wheel spin rate: `WHEEL_SPIN_RATE = 42`
- Maximum front steering angle: `18deg`
- Steering axis: world/local Y through the nested steering pivot
- Rear wheels: rolling only, no steering
- Front and rear spin use one-dimensional quaternion axis-angle rotation

## Verified Result

The 2026-07-25 visual test confirmed:

- Both front wheels rotate correctly.
- Both rear wheels rotate around stable, cambered single axes.
- Rear wheel centers do not wobble, rise, or move sideways during rotation.
- Tire surfaces, sidewalls, rims, and hubs rotate together.
- Body, suspension, and aerodynamic components remain static.
- The normal race and the dedicated test page share the same wheel logic.

## Regression Checklist

After modifying Red Bull model loading, wheel selection, pivots, or animation:

1. Open:
   `http://127.0.0.1:5189/?redbullWheelTest=1`
2. Inspect all four green axle guides.
3. Test forward spin at low and high speed.
4. Inspect both rear wheels from their outer and body-facing sides.
5. Confirm there is no multi-axis wobble or center drift.
6. Confirm no body, suspension, or aerodynamic geometry rotates.
7. Run `npm run build`.
8. Run `npm run verify:redbull-wheels`.
9. Do not update the verifier hash until the visual result is confirmed.
