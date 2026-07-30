export interface AudiSideProjectorTemplate {
  name: 'left' | 'right'
  side: -1 | 1
  centerY: number
  centerZ: number
  width: number
  height: number
  rayOriginDistance: number
}

export interface AudiLiveryTemplate {
  bodyMaterials: readonly string[]
  excludedMaterials: readonly string[]
  factoryDecalMaterials: readonly string[]
  textureWidth: number
  textureHeight: number
  projectors: readonly AudiSideProjectorTemplate[]
  topProjectors: readonly {
    name: 'nose' | 'engine' | 'tail'
    centerZ: number
    width: number
    length: number
  }[]
  subjectSafeZone: {
    x: number
    y: number
    width: number
    height: number
  }
}

export const AUDI_LIVERY_TEMPLATE: AudiLiveryTemplate = {
  bodyMaterials: ['livery_audi_01'],
  excludedMaterials: [
    'glass',
    'carbon',
    'fom_car_carbon1',
    'fom_car_carbon4',
    'sidewall',
    'tread_medium',
    'plastic_interior',
  ],
  factoryDecalMaterials: [
    'fom_car_dummy_decal',
    'fom_car_detail',
  ],
  textureWidth: 512,
  textureHeight: 256,
  projectors: [
    {
      name: 'left',
      side: -1,
      centerY: 0.41,
      centerZ: -0.03,
      width: 0.72,
      height: 0.82,
      rayOriginDistance: 0.62,
    },
    {
      name: 'right',
      side: 1,
      centerY: 0.41,
      centerZ: -0.03,
      width: 0.72,
      height: 0.82,
      rayOriginDistance: 0.62,
    },
  ],
  topProjectors: [
    { name: 'nose', centerZ: 0.31, width: 0.62, length: 0.42 },
    { name: 'engine', centerZ: -0.08, width: 0.72, length: 0.34 },
    { name: 'tail', centerZ: -0.39, width: 0.78, length: 0.22 },
  ],
  subjectSafeZone: {
    x: 0.08,
    y: 0.04,
    width: 0.84,
    height: 0.92,
  },
}
