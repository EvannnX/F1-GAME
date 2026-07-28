# Ferrari F1-75 Wheel Profile

Last verified: 2026-07-26

This file records the known-good model, wheel hierarchy, animation strategy,
and preview lighting for the Ferrari F1-75. Do not reuse this profile for Red
Bull, Mercedes, or McLaren. Each car owns an independent wheel strategy.

## Protected Asset

- Car ID: `ferrari`
- Wheel strategy: `ferrari-f1-75-named-v1`
- Model:
  `src/assets/已压缩车模型/2022_ferrari_f1-75 (1)-optimized 2.glb`
- Model size: `4,490,808` bytes
- Model SHA-256:
  `8c6493d3be5c359cf7efbd94b6d0a60280cc14e453a2c9b39ee9d526b08b59c1`
- Model orientation: `reverse: false`
- Normalized game length: `5.0 m`

If this model is replaced or re-exported, its node names, hierarchy, authored
quaternions, pivots, and local axes may change. Recalibrate this Ferrari
profile instead of changing another car's wheel strategy.

## Main-Game Integration

The garage, normal race, and standalone test all use the protected GLB:

1. The garage selects car ID `ferrari`.
2. `src/data/playerCars.ts` resolves the F1-75 model and
   `ferrari-f1-75-named-v1`.
3. `createCar().setCarModel('ferrari')` loads and fits the GLB.
4. `createPlayerWheelRigs()` dispatches to
   `createFerrariF175WheelRigs()`.
5. The wheel strategy uses the model's authored wheel and hub nodes directly.

The formal game must not split Ferrari wheel meshes by bounds, materials, or
connected-component guesses. This model already provides complete named wheel
assemblies.

## Verified Node Mapping

| Slot | Rolling node | Steering/hub node |
|---|---|---|
| Right front | `WHEEL_RF_19` | `HUB_RF_20` |
| Left front | `WHEEL_LF_40` | `HUB_LF_41` |
| Left rear | `WHEEL_LR_54` | `HUB_LR_55` |
| Right rear | `WHEEL_RR_69` | `HUB_RR_70` |

Each `WHEEL_*` node contains its complete rim and tire hierarchy. The front
wheel nodes are direct children of their corresponding `HUB_*` nodes.

## Known-Good Animation Rules

- Roll every complete `WHEEL_*` node around its authored local X axis:
  `(1, 0, 0)`.
- Preserve the wheel node's original quaternion and apply roll with:
  `baseQuaternion * spinQuaternion`.
- Preserve the authored wheel camber. Do not replace the local axis with a
  shared world-space axle.
- Apply front steering to `HUB_RF_20` and `HUB_LF_41`.
- Apply the steering quaternion before the authored hub quaternion
  (`premultiply`), matching the verified standalone preview.
- Rear hubs do not steer.
- Do not add suspension, bodywork, or aerodynamic nodes to the rolling groups.
- Wheel spin rate: `42 rad/s` at normalized speed `1.0`.
- Maximum front steering angle: `18 degrees`.

## Preview Lighting

The standalone preview intentionally preserves the original GLB textures and
material colors. The saturated red paint depends on reflected lighting because
`CAR_CHASSIS` has a low roughness value of approximately `0.05`.

- Output color space: `SRGBColorSpace`
- Tone mapping: `AgXToneMapping`
- Exposure: `1.08`
- Environment: local `RoomEnvironment` converted through PMREM
- Scene environment intensity: `1.05`
- Car material environment intensity: `1.30`
- Neutral warm key light, soft neutral fill, and white rear rim light

Do not compensate for missing environment lighting by overwriting the Ferrari
base-color texture or applying an artificial red material.

## Verified Result

The 2026-07-26 standalone visual test confirmed:

- All four complete tire and rim assemblies rotate.
- Each wheel rolls around a stable one-dimensional local axis.
- The authored front and rear camber remains intact.
- Front steering and rolling are separated through the native hub hierarchy.
- No body, suspension, or aerodynamic parts rotate with the tires.
- The restored studio lighting produces saturated red paint, dark carbon
  fiber, readable decals, and controlled highlights.

## Regression Checklist

After modifying Ferrari model loading, wheel nodes, animation, or lighting:

1. Open:
   `http://127.0.0.1:5189/?ferrariF175WheelTest=1`
2. Inspect all four green axle guides.
3. Test forward spin at low and high speed.
4. Test front steering in both directions.
5. Inspect inner and outer tire faces, rims, hubs, and tire lettering.
6. Confirm no body, suspension, or aerodynamic geometry rotates.
7. Select Ferrari in the garage and confirm the car faces the camera.
8. Start a race and confirm the formal game uses the same F1-75 model.
9. Run `npm run build`.
