# Mercedes-AMG W15 Wheel Profile

Last verified: 2026-07-25

This file records the known-good wheel configuration for the compressed
Mercedes-AMG W15. Do not reuse this profile for Red Bull, Ferrari, or McLaren.
Each car owns an independent wheel strategy.

## Protected Asset

- Car ID: `mercedes`
- Wheel strategy: `mercedes-w15-compressed-v1`
- Model:
  `src/assets/已压缩车模型/amg_f1_w15_2024__www.vecarz.com-optimized 2.glb`
- Model size: `3,232,628` bytes
- Model SHA-256:
  `6675b12955fc1dccffdf72c8b07fbd5af2d62bbf8fe5a32f89f578d4ad1fa544`
- Model orientation: `reverse: true`
- Normalized game length: `5.0 m`

If this model is replaced or re-exported, its connected components, vertex
order, wheel centers, and principal axes may change. Recalibrate the Mercedes
profile instead of changing the Red Bull profile.

## Main-Game Integration

The test page and the normal race deliberately share one implementation:

1. The garage selects car ID `mercedes`.
2. `src/data/playerCars.ts` resolves the model and
   `mercedes-w15-compressed-v1`.
3. `createCar().setCarModel('mercedes')` loads and fits the GLB.
4. `createPlayerWheelRigs()` dispatches to
   `createMercedesW15WheelRigs()`.
5. `splitMercedesWheelComponents()` supplies the four wheel groups, centers,
   and front camber axes.

There must not be a second Mercedes wheel implementation in the test UI.
`src/ui/mercedesWheelTest.ts` uses the same `createCar()` path as the race.

## Known-Good Geometry Rules

The compressed W15 has two flattened meshes and one shared material. Wheel
selection therefore cannot depend on node names or materials.

- First split each mesh into connected triangle components.
- Detect the four tire anchors from wheel-like component shape and position.
- Fit the front hub circle center from geometry; require at least `12` unique
  vertices for the circle fit.
- Preserve separate left/right X positions.
- Force both front centers to share the averaged Y and Z axle center.
- Derive each front camber axis from the smallest principal axis of its
  isolated tire source geometry.
- Orient detected axes outward before constructing wheel rigs.
- Negate only the final `left-front` spin axis. This gives both front wheels
  the same forward rolling direction. Do not negate `right-front`.
- Rear wheels use the fixed world axle `(1, 0, 0)`.

### Tire-shape component test

Sidewall completion is based on shape, not simple proximity:

- Angular bins around the real cambered axle: `16`
- Required occupied bins for a closed tire ring: `12`
- Required ring-triangle coverage: `>= 0.55`
- Inner ring radius: `tireDiameter * 0.24`
- Outer ring radius: `tireDiameter * 0.60`
- Sidewall normal alignment with cambered axle: `>= 0.55`
- A confirmed closed-ring connected component rotates as one whole component.

This whole-component rule is important. Do not cut a confirmed tire component
again with world-X bounds; doing so leaves the inner or outer sidewall fixed.

### Detached outer sidewall overlays

The current model also has detached outer-sidewall geometry. Its known-good
fallback uses coordinates relative to the cambered wheel axis:

- Axial minimum:
  `axialMin + (axialMax - axialMin) * 0.50`
- Axial maximum:
  `axialMax + (axialMax - axialMin) * 0.25`
- Radial minimum: `tireAnnulusRadius * 0.95`
- Radial maximum: `wheelRadius * 1.08`

Keep this fallback narrow. Expanding it toward the car body can capture
suspension or aerodynamic geometry.

## Animation Parameters

- Wheel spin rate: `42 rad/s` at normalized speed `1.0`
- Maximum front steering angle: `18 degrees`
- Steering sign:
  `-smoothSteer * FRONT_STEER_MAX_RAD`
- Spin and steering use nested pivots.
- Each front wheel spins around its own cambered one-dimensional axis.

## Verified Result

The 2026-07-25 visual test confirmed:

- Both front tires rotate around their correct cambered centers.
- Inner and outer tire faces rotate with the tread.
- Hubs rotate with the tires.
- Nearby body, suspension, and aerodynamic pieces remain static during spin.
- Both front wheels roll forward in the same physical direction.
- Rear wheel behavior remains correct.
- Red Bull wheel behavior remains protected and unchanged.

## Regression Checklist

After modifying Mercedes model loading or wheel code:

1. Open:
   `http://127.0.0.1:5189/?amgWheelTest=1`
2. Test forward spin at low speed and high speed.
3. Inspect both front wheels from outside and from the body-facing side.
4. Confirm tire lettering, tread, sidewalls, and hubs rotate together.
5. Confirm suspension and aero pieces do not rotate.
6. Confirm both front wheels rotate forward.
7. Run `npm run build`.
8. Run `npm run verify:redbull-wheels`.

If a regression appears, compare the model SHA-256 and this profile before
changing thresholds.
