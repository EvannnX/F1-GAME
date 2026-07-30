import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import {
  PLAYER_CARS,
  playerCarById,
  readSelectedPlayerCar,
  selectPlayerCar,
  type PlayerCarDefinition,
  type PlayerCarId,
} from '../data/playerCars'
import { loadLocalAsset } from '../utils/localAsset'
import { storage } from '../utils/storage'
import {
  applyFomThemeColor,
  applyFomSpecialLivery,
  FOM_LIVERY_SCHEMES,
  FOM_THEME_COLORS,
  preloadFomSpecialLivery,
  readFomLiveryScheme,
  readFomThemeColor,
  selectFomLiveryScheme,
  selectFomThemeColor,
  type FomLiverySchemeId,
  type FomSpecialLivery,
} from '../render/fomSpecialLivery'
import {
  applyCustomLivery,
  clearCustomLivery,
  prepareCustomLogo,
} from '../render/customLogo'
import { replaceStaticMarkup } from '../utils/staticMarkup'
import { createPageBackButton } from './backButton'

export interface GarageController {
  destroy: () => void
}

interface GarageOption {
  key: string
  definition: PlayerCarDefinition
  name: string
  model: string
  code: string
  accent: string
  themeColor?: string
}

const STYLE_ID = 'f1s-garage-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-garage {
      position: fixed;
      inset: 0;
      z-index: 460;
      overflow: hidden;
      background: #d7d9de;
      color: #15171c;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-garage__canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      cursor: grab;
    }
    .f1s-garage__canvas:active { cursor: grabbing; }
    .f1s-garage__topline {
      position: absolute;
      z-index: 2;
      top: 0;
      left: 0;
      width: 100%;
      height: 7px;
      background: #d41222;
      box-shadow: 0 2px 16px rgba(0, 0, 0, .34);
    }
    .f1s-garage__heading {
      position: absolute;
      z-index: 2;
      top: 24px;
      left: clamp(88px, 11vw, 150px);
      display: flex;
      align-items: center;
      min-width: min(360px, 52vw);
      height: 58px;
      padding: 0 42px 0 64px;
      background: rgba(250, 250, 251, .95);
      box-shadow: 0 8px 22px rgba(27, 30, 37, .16);
      clip-path: polygon(0 0, 100% 0, calc(100% - 32px) 100%, 0 100%);
      font-size: 22px;
      font-weight: 950;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__heading::before {
      content: '';
      position: absolute;
      left: 24px;
      width: 20px;
      height: 20px;
      border: 6px solid #d41222;
      transform: rotate(45deg);
    }
    .f1s-garage__identity {
      position: absolute;
      z-index: 2;
      top: 112px;
      left: 0;
      display: flex;
      width: min(610px, 62vw);
      min-height: 96px;
      align-items: center;
      padding: 14px 76px clamp(14px, 2vh, 22px) clamp(30px, 6vw, 92px);
      background: #b80f1d;
      color: #fff;
      clip-path: polygon(0 0, calc(100% - 64px) 0, 100% 50%, calc(100% - 64px) 100%, 0 100%);
      box-shadow: 0 12px 28px rgba(92, 3, 12, .25);
    }
    .f1s-garage__team {
      color: rgba(255, 255, 255, .68);
      font-size: 11px;
      font-weight: 850;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__name {
      margin-top: 3px;
      font-size: clamp(24px, 3vw, 38px);
      font-weight: 950;
      line-height: 1;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__model {
      margin-top: 7px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .f1s-garage__arrow {
      position: absolute;
      z-index: 3;
      top: 53%;
      display: grid;
      width: 72px;
      height: 72px;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, .82);
      border-radius: 50%;
      background: #b80f1d;
      color: #fff;
      font: 500 58px/1 Arial, sans-serif;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(24, 26, 32, .24);
      transform: translateY(-50%);
      transition: transform .16s ease, background .16s ease;
    }
    .f1s-garage__arrow:hover,
    .f1s-garage__arrow:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateY(-50%) scale(1.06);
    }
    .f1s-garage__arrow--prev { left: clamp(18px, 6vw, 104px); }
    .f1s-garage__arrow--next { right: clamp(18px, 6vw, 104px); }
    .f1s-garage__arrow span { transform: translateY(-4px); }
    .f1s-garage__liveries {
      position: absolute;
      z-index: 4;
      left: clamp(22px, 5vw, 76px);
      bottom: max(26px, calc(env(safe-area-inset-bottom) + 18px));
      display: grid;
      grid-template-columns: repeat(4, minmax(104px, 1fr));
      width: min(540px, 48vw);
      gap: 7px;
      transition: opacity .16s ease;
    }
    .f1s-garage__liveries[hidden] { display: none; }
    .f1s-garage__colors {
      grid-template-columns: repeat(5, minmax(96px, 1fr));
      width: min(620px, 54vw);
    }
    .f1s-garage__livery {
      display: flex;
      min-width: 0;
      height: 38px;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border: 1px solid rgba(21, 23, 28, .22);
      border-radius: 4px;
      background: rgba(248, 249, 251, .9);
      color: #252831;
      font: 800 11px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      cursor: pointer;
    }
    .f1s-garage__livery:hover,
    .f1s-garage__livery:focus-visible {
      border-color: #d41222;
      outline: none;
    }
    .f1s-garage__livery.is-active {
      border-color: #d41222;
      background: #fff;
      box-shadow: inset 0 -3px #d41222, 0 5px 14px rgba(29, 31, 38, .14);
    }
    .f1s-garage__livery-swatch {
      flex: 0 0 auto;
      width: 24px;
      height: 16px;
      border: 1px solid rgba(0, 0, 0, .18);
      background: var(--livery-primary);
      box-shadow:
        inset -7px 0 var(--livery-accent-a),
        inset -13px 0 var(--livery-accent-b);
    }
    .f1s-garage__livery-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .f1s-garage__diy {
      position: absolute;
      z-index: 4;
      left: clamp(22px, 5vw, 76px);
      bottom: max(26px, calc(env(safe-area-inset-bottom) + 18px));
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px;
      border: 1px solid rgba(21, 23, 28, .16);
      border-radius: 6px;
      background: rgba(248, 249, 251, .88);
      box-shadow: 0 8px 22px rgba(27, 30, 37, .16);
      backdrop-filter: blur(8px);
    }
    .f1s-garage__diy[hidden] { display: none; }
    .f1s-garage__upload,
    .f1s-garage__clear-logo {
      min-height: 42px;
      padding: 0 17px;
      border: 0;
      border-radius: 5px;
      background: #b80f1d;
      color: #fff;
      font: 850 14px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      cursor: pointer;
    }
    .f1s-garage__clear-logo { background: #4e525b; }
    .f1s-garage__logo-status {
      max-width: 150px;
      color: #555963;
      font-size: 12px;
      font-weight: 750;
    }
    .f1s-garage__logo-preview {
      width: 42px;
      height: 42px;
      border: 2px solid #fff;
      border-radius: 5px;
      background: #d9dbe0;
      object-fit: cover;
      box-shadow: 0 2px 8px rgba(0, 0, 0, .18);
    }
    .f1s-garage__footer {
      position: absolute;
      z-index: 3;
      right: clamp(20px, 5vw, 76px);
      bottom: max(26px, calc(env(safe-area-inset-bottom) + 18px));
      display: flex;
      align-items: center;
      gap: 22px;
    }
    .f1s-garage__count {
      color: #5d616b;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .f1s-garage__continue {
      position: relative;
      min-width: 310px;
      min-height: 72px;
      padding: 0 68px 0 48px;
      border: 2px solid #fff;
      border-radius: 6px;
      background: #b80f1d;
      color: #fff;
      font: 950 21px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 12px 26px rgba(42, 10, 14, .3);
      transition: background .16s ease, transform .16s ease;
    }
    .f1s-garage__continue::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 28px;
      font: 500 38px/1 Arial, sans-serif;
      transform: translateY(-55%);
    }
    .f1s-garage__continue:hover,
    .f1s-garage__continue:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateY(-2px);
    }
    .f1s-garage--leaving {
      opacity: 0;
      pointer-events: none;
      transition: opacity .28s ease;
    }
    .f1s-garage {
      background:
        linear-gradient(174deg, transparent 0 20%, rgba(255, 170, 176, .18) 21%, transparent 31%),
        linear-gradient(187deg, transparent 0 42%, rgba(255, 207, 209, .13) 43%, transparent 52%),
        radial-gradient(ellipse at 43% 57%, rgba(255, 147, 154, .62) 0, rgba(166, 28, 66, .42) 29%, transparent 58%),
        linear-gradient(158deg, #230710 0%, #6f102d 24%, #c94f68 45%, #7d1235 62%, #17050d 82%, #3f0b1d 100%);
      color: #fff;
    }
    .f1s-garage::before,
    .f1s-garage::after {
      content: '';
      position: absolute;
      z-index: 0;
      left: -8%;
      width: 118%;
      pointer-events: none;
      border-radius: 50%;
      transform: rotate(-5deg);
    }
    .f1s-garage::before {
      top: 15%;
      height: 34%;
      border-top: 42px solid rgba(255, 218, 219, .13);
      border-bottom: 76px solid rgba(54, 0, 22, .35);
      box-shadow: 0 34px 90px rgba(255, 177, 181, .12);
    }
    .f1s-garage::after {
      top: 45%;
      height: 25%;
      border-top: 28px solid rgba(255, 193, 196, .18);
      border-bottom: 58px solid rgba(65, 0, 27, .46);
    }
    .f1s-garage__canvas {
      z-index: 1;
      right: -18%;
      bottom: 106px;
      left: 18%;
      width: auto;
      height: auto;
      transform: translateY(-4vh);
    }
    .f1s-garage__topline { display: none; }
    .f1s-garage__heading {
      top: 34px;
      left: 28px;
      min-width: 0;
      width: auto;
      height: 40px;
      padding: 0 17px;
      border-radius: 3px;
      background: #ef5361;
      color: #fff;
      clip-path: none;
      font-size: 15px;
      box-shadow: 0 5px 18px rgba(44, 0, 12, .28);
    }
    .f1s-garage__heading::before { display: none; }
    .f1s-garage__identity {
      top: 88px;
      left: 28px;
      width: min(700px, 57vw);
      min-height: 82px;
      padding: 0;
      background: none;
      clip-path: none;
      box-shadow: none;
    }
    .f1s-garage__team {
      color: rgba(255, 255, 255, .72);
      font-size: 13px;
    }
    .f1s-garage__name {
      margin-top: 7px;
      max-width: 660px;
      font-size: clamp(30px, 3.35vw, 48px);
      line-height: 1.08;
      text-shadow: 0 3px 16px rgba(34, 0, 10, .36);
    }
    .f1s-garage__model {
      margin-top: 8px;
      color: rgba(255, 255, 255, .82);
      font-size: 14px;
    }
    .f1s-garage__rail {
      position: absolute;
      z-index: 8;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      height: 106px;
      align-items: flex-end;
      justify-content: center;
      gap: 10px;
      padding: 9px 24px 12px;
      overflow-x: auto;
      background: linear-gradient(180deg, transparent, rgba(15, 4, 9, .76) 24%);
      scrollbar-width: none;
    }
    .f1s-garage__rail::-webkit-scrollbar { display: none; }
    .f1s-garage__car-option {
      flex: 0 0 180px;
      height: 78px;
      padding: 7px;
      border: 1px solid rgba(255, 255, 255, .25);
      border-radius: 7px 7px 2px 2px;
      background: linear-gradient(160deg, rgba(55, 42, 48, .88), rgba(21, 13, 17, .92));
      color: #fff;
      cursor: pointer;
    }
    .f1s-garage__car-option:hover,
    .f1s-garage__car-option:focus-visible {
      border-color: #fff;
      outline: none;
    }
    .f1s-garage__car-option.is-active {
      height: 88px;
      border: 2px solid #fff;
      background: linear-gradient(155deg, rgba(98, 79, 88, .98), rgba(42, 29, 35, .98));
      box-shadow: 0 0 0 1px rgba(255, 255, 255, .2), 0 -9px 24px rgba(0, 0, 0, .28);
      transform: translateY(-3px);
    }
    .f1s-garage__car-code {
      display: grid;
      height: 36px;
      place-items: center;
      color: var(--car-accent);
      font-size: 18px;
      font-weight: 950;
    }
    .f1s-garage__car-label {
      display: block;
      overflow: hidden;
      color: rgba(255, 255, 255, .82);
      font-size: 10px;
      font-weight: 780;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .f1s-garage__arrow { display: none; }
    .f1s-garage__liveries,
    .f1s-garage__diy {
      left: 28px;
      bottom: 122px;
    }
    .f1s-garage__livery {
      border-color: rgba(255, 255, 255, .26);
      background: rgba(29, 18, 23, .78);
      color: #fff;
    }
    .f1s-garage__livery.is-active {
      border-color: #fff;
      background: rgba(84, 30, 48, .94);
      box-shadow: inset 0 -3px #ef5361;
    }
    .f1s-garage__diy {
      border-color: rgba(255, 255, 255, .28);
      background: linear-gradient(135deg, rgba(50, 27, 37, .78), rgba(24, 13, 18, .84));
      box-shadow: inset 0 1px rgba(255, 255, 255, .12), 0 12px 28px rgba(27, 0, 10, .2);
    }
    .f1s-garage__logo-status { color: rgba(255, 255, 255, .72); }
    .f1s-garage__footer {
      right: 30px;
      bottom: 122px;
    }
    .f1s-garage__count { color: rgba(255, 255, 255, .7); }
    .f1s-garage__continue {
      min-width: 240px;
      min-height: 56px;
      border-color: rgba(255, 255, 255, .88);
      background: linear-gradient(180deg, #e21a3a, #b70728);
      font-size: 17px;
      box-shadow: inset 0 1px rgba(255, 255, 255, .28), 0 10px 25px rgba(45, 0, 13, .32);
    }
    .f1s-garage--capture .f1s-garage__topline,
    .f1s-garage--capture .f1s-garage__heading,
    .f1s-garage--capture .f1s-garage__identity,
    .f1s-garage--capture .f1s-garage__rail,
    .f1s-garage--capture .f1s-garage__arrow,
    .f1s-garage--capture .f1s-garage__liveries,
    .f1s-garage--capture .f1s-garage__diy,
    .f1s-garage--capture .f1s-garage__footer {
      display: none;
    }
    @media (max-height: 620px) {
      .f1s-garage__heading {
        top: 14px;
        height: 46px;
        min-width: 290px;
        padding-left: 54px;
        font-size: 17px;
      }
      .f1s-garage__heading::before { left: 20px; width: 15px; height: 15px; border-width: 4px; }
      .f1s-garage__identity {
        top: 72px;
        width: min(430px, 55vw);
        min-height: 70px;
        padding: 10px 58px 11px 34px;
      }
      .f1s-garage__name { font-size: 23px; }
      .f1s-garage__team { display: none; }
      .f1s-garage__model { margin-top: 4px; font-size: 11px; }
      .f1s-garage__arrow { width: 56px; height: 56px; font-size: 46px; }
      .f1s-garage__footer { right: 18px; bottom: 14px; }
      .f1s-garage__diy { left: 18px; bottom: 14px; padding: 7px; }
      .f1s-garage__upload,
      .f1s-garage__clear-logo { min-height: 38px; padding: 0 12px; font-size: 12px; }
      .f1s-garage__logo-status { display: none; }
      .f1s-garage__continue { min-width: 240px; min-height: 56px; font-size: 18px; }
      .f1s-garage__liveries {
        left: 18px;
        bottom: 14px;
        width: min(500px, 54vw);
        grid-template-columns: repeat(4, minmax(92px, 1fr));
      }
      .f1s-garage__livery { height: 32px; padding: 0 7px; font-size: 10px; }
    }
    @media (max-width: 900px) {
      .f1s-garage__canvas {
        right: -10%;
        bottom: 100px;
        left: 10%;
        transform: translateY(-2vh);
        -webkit-mask-image: none;
        mask-image: none;
      }
      .f1s-garage__identity { width: calc(100vw - 56px); }
      .f1s-garage__rail {
        justify-content: flex-start;
        padding-right: 18px;
        padding-left: 18px;
      }
      .f1s-garage__footer { right: 14px; bottom: 118px; }
      .f1s-garage__continue { min-width: 190px; }
      .f1s-garage__liveries {
        right: 14px;
        bottom: max(92px, calc(env(safe-area-inset-bottom) + 84px));
        left: 14px;
        display: flex;
        width: auto;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .f1s-garage__liveries::-webkit-scrollbar { display: none; }
      .f1s-garage__livery { flex: 0 0 112px; }
    }
    @media (orientation: landscape) and (max-width: 950px),
      (orientation: landscape) and (max-height: 500px) {
      .f1s-garage__heading { display: none; }
      .f1s-garage__identity {
        z-index: 10;
        top: max(54px, calc(env(safe-area-inset-top) + 10px));
        left: max(16px, calc(env(safe-area-inset-left) + 10px));
        width: 39vw;
        min-height: 0;
        padding: 0;
      }
      .f1s-garage__team { display: none; }
      .f1s-garage__name {
        margin-top: 0;
        font-size: clamp(20px, 6.2vh, 30px);
        line-height: 1.02;
      }
      .f1s-garage__model {
        margin-top: 5px;
        font-size: clamp(9px, 2.8vh, 12px);
        line-height: 1.2;
      }
      .f1s-garage__canvas {
        top: 0;
        right: max(4px, env(safe-area-inset-right));
        bottom: 72px;
        left: 28%;
        width: auto;
        height: auto;
        transform: none;
      }
      .f1s-garage__rail {
        z-index: 14;
        height: 72px;
        justify-content: center;
        gap: 6px;
        padding: 5px max(10px, env(safe-area-inset-right))
          max(5px, env(safe-area-inset-bottom))
          max(10px, env(safe-area-inset-left));
        overflow-x: auto;
        background: linear-gradient(180deg, rgba(17, 3, 9, .18), rgba(17, 3, 9, .94) 28%);
      }
      .f1s-garage__car-option,
      .f1s-garage__car-option.is-active {
        flex: 0 0 min(22vw, 154px);
        height: 58px;
        min-height: 52px;
        padding: 4px 6px;
        transform: none;
      }
      .f1s-garage__car-code {
        height: 28px;
        font-size: 15px;
      }
      .f1s-garage__car-label { font-size: 9px; }
      .f1s-garage__diy {
        z-index: 15;
        right: auto;
        bottom: max(79px, calc(env(safe-area-inset-bottom) + 76px));
        left: max(10px, calc(env(safe-area-inset-left) + 8px));
        max-width: 49vw;
        gap: 5px;
        padding: 5px;
      }
      .f1s-garage__upload,
      .f1s-garage__clear-logo {
        min-height: 42px;
        padding: 0 11px;
        font-size: 11px;
        touch-action: manipulation;
      }
      .f1s-garage__logo-preview {
        width: 36px;
        height: 36px;
      }
      .f1s-garage__logo-status {
        display: none;
      }
      .f1s-garage__footer {
        z-index: 15;
        right: max(10px, calc(env(safe-area-inset-right) + 8px));
        bottom: max(79px, calc(env(safe-area-inset-bottom) + 76px));
        gap: 7px;
      }
      .f1s-garage__count { font-size: 11px; }
      .f1s-garage__continue {
        min-width: min(31vw, 190px);
        min-height: 44px;
        padding: 0 38px 0 18px;
        font-size: 14px;
        touch-action: manipulation;
      }
      .f1s-garage__continue::after {
        right: 15px;
        font-size: 27px;
      }
      .f1s-garage__liveries,
      .f1s-garage__colors {
        z-index: 15;
        right: auto;
        bottom: max(79px, calc(env(safe-area-inset-bottom) + 76px));
        left: max(10px, calc(env(safe-area-inset-left) + 8px));
        display: flex;
        width: min(57vw, 510px);
        gap: 5px;
        overflow-x: auto;
      }
      .f1s-garage__liveries[hidden] { display: none; }
      .f1s-garage__livery {
        flex: 0 0 104px;
        height: 38px;
        padding: 0 7px;
        font-size: 9px;
        touch-action: manipulation;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-garage__arrow,
      .f1s-garage__continue,
      .f1s-garage--leaving { transition: none; }
    }
  `
  document.head.appendChild(style)
}

function fitForGarage(model: THREE.Object3D, definition: PlayerCarDefinition): void {
  let bbox = new THREE.Box3().setFromObject(model)
  let size = bbox.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.z)
  if (longest > 0) model.scale.setScalar(7.0 / longest)

  bbox = new THREE.Box3().setFromObject(model)
  size = bbox.getSize(new THREE.Vector3())
  if (size.x > size.z * 1.1) model.rotation.y = -Math.PI / 2
  if (definition.reverse) model.rotation.y += Math.PI

  bbox = new THREE.Box3().setFromObject(model)
  const center = bbox.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -bbox.min.y + 0.02, -center.z)
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = true
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 1
        material.needsUpdate = true
      }
    }
  })
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material?.dispose()
  })
}

export function showGarageSelection(
  onConfirm: (id: PlayerCarId) => void,
  onBack?: () => void,
): GarageController {
  installStyles()
  const params = new URLSearchParams(window.location.search)
  const captureMode = params.has('specialLiveryCapture')
  const captureYawDeg = THREE.MathUtils.clamp(Number(params.get('captureYaw') ?? 0), -18, 18)
  const capturePitchDeg = THREE.MathUtils.clamp(Number(params.get('capturePitch') ?? 8), 3, 18)
  const mobileGpu = window.matchMedia('(pointer: coarse)').matches

  const customDefinition = playerCarById('audi')
  const creatorDefinition = playerCarById('creator')
  const specialDefinition = playerCarById('creator-special')
  const partnerDefinition = playerCarById('creator-partner')
  const garageOptions: readonly GarageOption[] = [
    {
      key: 'custom',
      definition: customDefinition,
      name: '照片DIY赛车',
      model: '上传图片生成专属赛车',
      code: '照片 DIY',
      accent: '#f2f2f2',
    },
    {
      key: 'solid',
      definition: creatorDefinition,
      name: '纯色DIY赛车',
      model: '选择纯色生成专属赛车',
      code: '纯色 DIY',
      accent: '#f1f2f4',
      themeColor: '#d9d9d6',
    },
    {
      key: 'creator-special',
      definition: specialDefinition,
      name: '抖音AI创变者特涂',
      model: 'FOM 2026 特涂',
      code: 'AI',
      accent: '#ff6f91',
    },
    {
      key: 'creator-partner',
      definition: partnerDefinition,
      name: '合作伙伴特涂',
      model: 'FOM 2026 合作伙伴特涂',
      code: 'PRO',
      accent: '#c991ff',
    },
  ]
  const selectedCarId = readSelectedPlayerCar()
  let selectedIndex = Math.max(
    0,
    garageOptions.findIndex((option) => option.definition.id === selectedCarId),
  )
  const host = document.createElement('section')
  host.className = 'f1s-garage'
  host.classList.toggle('f1s-garage--capture', captureMode)
  host.setAttribute('aria-label', '赛车车库')
  replaceStaticMarkup(host, `
    <div class="f1s-garage__topline"></div>
    <div class="f1s-garage__heading">赛车选择</div>
    <div class="f1s-garage__identity" aria-live="polite">
      <div>
        <div class="f1s-garage__name"></div>
        <div class="f1s-garage__model"></div>
      </div>
    </div>
    <nav class="f1s-garage__rail" aria-label="赛车选择"></nav>
    <button class="f1s-garage__arrow f1s-garage__arrow--prev" type="button" aria-label="上一辆赛车" title="上一辆赛车"><span>‹</span></button>
    <button class="f1s-garage__arrow f1s-garage__arrow--next" type="button" aria-label="下一辆赛车" title="下一辆赛车"><span>›</span></button>
    <div class="f1s-garage__liveries f1s-garage__colors" aria-label="创变者纯色选择" hidden></div>
    <div class="f1s-garage__liveries" aria-label="特涂配色选择" hidden></div>
    <div class="f1s-garage__diy" hidden>
      <input class="f1s-garage__logo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      <button class="f1s-garage__upload" type="button">上传 DIY 图片</button>
      <button class="f1s-garage__clear-logo" type="button">清除</button>
      <img class="f1s-garage__logo-preview" alt="当前上传图片预览" hidden>
      <span class="f1s-garage__logo-status" aria-live="polite"></span>
    </div>
    <div class="f1s-garage__footer">
      <div class="f1s-garage__count"></div>
      <button class="f1s-garage__continue" type="button">确认赛车</button>
    </div>
  `)
  document.body.appendChild(host)
  document.body.classList.add('f1s-garage-active')

  const canvasHost = document.createElement('div')
  canvasHost.className = 'f1s-garage__canvas'
  host.prepend(canvasHost)

  const scene = new THREE.Scene()
  scene.background = captureMode ? new THREE.Color('#d7d9de') : null
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80)
  camera.position.set(6.5, 2.9, 8.2)

  const renderer = new THREE.WebGLRenderer({
    alpha: !captureMode,
    antialias: !mobileGpu,
    powerPreference: 'high-performance',
  })
  if (!captureMode) renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 0.96
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasHost.appendChild(renderer.domElement)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04)
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = mobileGpu ? 0.7 : 0.84
  roomEnvironment.dispose()
  pmrem.dispose()

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.72, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.065
  controls.enablePan = false
  controls.enableRotate = true
  controls.enableZoom = true
  controls.zoomToCursor = true
  controls.minDistance = 6.8
  controls.maxDistance = 14
  controls.minPolarAngle = Math.PI * 0.2
  controls.maxPolarAngle = Math.PI * 0.47
  controls.autoRotate = false

  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: captureMode ? '#eef0f3' : '#5d2638',
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.42,
    clearcoatRoughness: 0.32,
    transparent: !captureMode,
    opacity: captureMode ? 1 : 0,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.03
  floor.receiveShadow = true
  scene.add(floor)

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: captureMode ? '#f8f9fa' : '#8f4053',
    roughness: 0.38,
    metalness: 0.1,
    transparent: !captureMode,
    opacity: captureMode ? 1 : 0,
  })
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.5, 0.08, 96), platformMaterial)
  platform.position.y = -0.02
  platform.receiveShadow = true
  scene.add(platform)

  const key = new THREE.DirectionalLight('#fff4e8', 2)
  key.position.set(-6, 10, 7)
  key.castShadow = true
  key.shadow.mapSize.set(mobileGpu ? 512 : 1024, mobileGpu ? 512 : 1024)
  key.shadow.camera.left = -8
  key.shadow.camera.right = 8
  key.shadow.camera.top = 7
  key.shadow.camera.bottom = -6
  key.shadow.bias = -0.00035
  key.shadow.normalBias = 0.025
  key.shadow.radius = 3
  scene.add(key)

  const keyPanel = new THREE.RectAreaLight('#fff2e5', 11, 7.5, 4.2)
  keyPanel.position.set(-4.8, 6.2, 6.5)
  keyPanel.lookAt(0, 0.75, 0)
  scene.add(keyPanel)

  const fillPanel = new THREE.RectAreaLight('#cde3ff', 5.5, 4.8, 3)
  fillPanel.position.set(5.5, 3.6, 5.2)
  fillPanel.lookAt(0, 0.65, 0)
  scene.add(fillPanel)

  const rimPanel = new THREE.RectAreaLight('#9ed4ff', 10.5, 5.5, 2.2)
  rimPanel.position.set(5.2, 4.5, -5.8)
  rimPanel.lookAt(0, 0.9, 0)
  scene.add(rimPanel)

  const topPanel = new THREE.RectAreaLight('#ffffff', 7, 6.5, 3)
  topPanel.position.set(0, 8.5, 0.4)
  topPanel.lookAt(0, 0, 0)
  scene.add(topPanel)

  scene.add(new THREE.HemisphereLight('#dce7f4', '#111216', 0.38))

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderConfig({ type: 'js' })
  dracoLoader.setWorkerLimit(1)
  ;(dracoLoader as unknown as {
    _loadLibrary: (url: string, responseType: string) => Promise<string | ArrayBuffer>
  })._loadLibrary = async (url: string) => {
    if (url.endsWith('draco_decoder.js')) {
      return (globalThis as typeof globalThis & { __F1TI_DRACO_DECODER__?: string })
        .__F1TI_DRACO_DECODER__ ?? dracoDecoderJs
    }
    throw new Error(`Unsupported Draco decoder asset: ${url}`)
  }
  loader.setDRACOLoader(dracoLoader)
  loader.setMeshoptDecoder(MeshoptDecoder)
  void preloadFomSpecialLivery(renderer).catch((error) => {
    console.warn('[F1S] FOM livery preload failed:', error)
  })

  const loaded = new Map<PlayerCarId, THREE.Group>()
  const loading = new Map<PlayerCarId, Promise<THREE.Group>>()
  const fomLiveries = new Map<PlayerCarId, FomSpecialLivery>()
  const modelBytes = new Map<string, Promise<ArrayBuffer>>()
  let currentModel: THREE.Group | null = null
  let destroyed = false

  const frameModel = (model: THREE.Object3D): void => {
    const box = new THREE.Box3().setFromObject(model)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const size = box.getSize(new THREE.Vector3())
    const target = new THREE.Vector3(0, box.min.y + size.y * 0.46, 0)
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
    const fitDistance = sphere.radius / Math.max(0.1, Math.sin(halfVerticalFov)) * 1.12
    const displayDistance = fitDistance * (captureMode ? 0.42 : 0.46)
    const viewDirection = captureMode
      ? new THREE.Vector3(
        Math.sin(THREE.MathUtils.degToRad(captureYawDeg)),
        Math.tan(THREE.MathUtils.degToRad(capturePitchDeg)),
        Math.cos(THREE.MathUtils.degToRad(captureYawDeg)),
      ).normalize()
      : new THREE.Vector3(0.58, 0.24, 0.78).normalize()

    controls.target.copy(target)
    camera.position.copy(target).addScaledVector(viewDirection, displayDistance)
    camera.near = Math.max(0.05, displayDistance * 0.02)
    camera.far = Math.max(80, fitDistance * 8)
    camera.updateProjectionMatrix()
    controls.minDistance = captureMode ? displayDistance * 0.95 : fitDistance * 0.2
    controls.maxDistance = captureMode ? displayDistance * 1.05 : fitDistance * 1.8
    controls.update()
  }

  const loadCar = (definition: PlayerCarDefinition): Promise<THREE.Group> => {
    const cached = loaded.get(definition.id)
    if (cached) return Promise.resolve(cached)
    const pending = loading.get(definition.id)
    if (pending) return pending
    const promise = (async (): Promise<THREE.Group> => {
      let bytesPromise = modelBytes.get(definition.url)
      if (!bytesPromise) {
        bytesPromise = loadLocalAsset(definition.url)
        modelBytes.set(definition.url, bytesPromise)
      }
      const bytes = await bytesPromise
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(bytes, '', (result) => resolve(result as unknown as { scene: THREE.Group }), reject)
      })
      fitForGarage(gltf.scene, definition)
      if (definition.id === 'creator') {
        applyFomThemeColor(gltf.scene, readFomThemeColor())
      } else if (definition.id === 'audi') {
        applyFomThemeColor(gltf.scene, '#ffffff')
      }
      if (definition.livery === 'fom-special' || definition.livery === 'fom-partner') {
        fomLiveries.set(
          definition.id,
          await applyFomSpecialLivery(
            gltf.scene,
            renderer,
            definition.livery === 'fom-partner' ? 'partners' : 'core',
          ),
        )
      }
      if (destroyed) {
        disposeModel(gltf.scene)
        throw new Error('Garage closed before the car finished loading')
      }
      for (const sibling of PLAYER_CARS) {
        if (sibling.id === definition.id || sibling.url !== definition.url) continue
        const oldLivery = fomLiveries.get(sibling.id)
        oldLivery?.dispose()
        fomLiveries.delete(sibling.id)
        const oldModel = loaded.get(sibling.id)
        if (oldModel) {
          oldModel.removeFromParent()
          disposeModel(oldModel)
          loaded.delete(sibling.id)
        }
      }
      loaded.set(definition.id, gltf.scene)
      loading.delete(definition.id)
      return gltf.scene
    })().catch((error) => {
      loading.delete(definition.id)
      throw error
    })
    loading.set(definition.id, promise)
    return promise
  }

  const nameEl = host.querySelector<HTMLDivElement>('.f1s-garage__name')!
  const modelEl = host.querySelector<HTMLDivElement>('.f1s-garage__model')!
  const railEl = host.querySelector<HTMLElement>('.f1s-garage__rail')!
  const countEl = host.querySelector<HTMLDivElement>('.f1s-garage__count')!
  const colorsEl = host.querySelector<HTMLDivElement>('.f1s-garage__colors')!
  const liveriesEl = host.querySelector<HTMLDivElement>(
    '.f1s-garage__liveries:not(.f1s-garage__colors)',
  )!
  const diyEl = host.querySelector<HTMLDivElement>('.f1s-garage__diy')!
  const logoInput = host.querySelector<HTMLInputElement>('.f1s-garage__logo-input')!
  const uploadLogoButton = host.querySelector<HTMLButtonElement>('.f1s-garage__upload')!
  const clearLogoButton = host.querySelector<HTMLButtonElement>('.f1s-garage__clear-logo')!
  const logoStatus = host.querySelector<HTMLSpanElement>('.f1s-garage__logo-status')!
  const logoPreview = host.querySelector<HTMLImageElement>('.f1s-garage__logo-preview')!
  const storedLogo = storage.getCustomLogo()
  if (storedLogo) {
    logoPreview.src = storedLogo
    logoPreview.hidden = false
  }
  logoStatus.textContent = storedLogo ? '已应用自定义图片' : 'PNG / JPG / WebP'
  let selectedFomColor = readFomThemeColor()
  const colorButtons = new Map<string, HTMLButtonElement>()
  const updateColorButtons = (): void => {
    for (const [hex, button] of colorButtons) {
      const active = hex === selectedFomColor
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
  }
  for (const color of FOM_THEME_COLORS) {
    const button = document.createElement('button')
    button.className = 'f1s-garage__livery'
    button.type = 'button'
    button.setAttribute('aria-label', `使用${color.name}`)
    button.style.setProperty('--livery-primary', color.hex)
    button.style.setProperty('--livery-accent-a', color.hex)
    button.style.setProperty('--livery-accent-b', color.hex)
    const swatch = document.createElement('span')
    swatch.className = 'f1s-garage__livery-swatch'
    const label = document.createElement('span')
    label.className = 'f1s-garage__livery-name'
    label.textContent = color.name
    button.append(swatch, label)
    button.addEventListener('click', () => {
      selectedFomColor = color.hex
      selectFomThemeColor(color.hex)
      const creatorModel = loaded.get('creator')
      if (creatorModel) applyFomThemeColor(creatorModel, color.hex)
      updateColorButtons()
      renderer.shadowMap.needsUpdate = true
    })
    colorButtons.set(color.hex, button)
    colorsEl.appendChild(button)
  }
  updateColorButtons()
  let selectedFomScheme = readFomLiveryScheme()
  const liveryButtons = new Map<FomLiverySchemeId, HTMLButtonElement>()
  const updateLiveryButtons = (): void => {
    for (const [id, button] of liveryButtons) {
      const active = id === selectedFomScheme
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
  }
  for (const scheme of FOM_LIVERY_SCHEMES) {
    const button = document.createElement('button')
    button.className = 'f1s-garage__livery'
    button.type = 'button'
    button.setAttribute('aria-label', `使用${scheme.name}配色`)
    button.style.setProperty('--livery-primary', scheme.primary ?? '#57068c')
    button.style.setProperty('--livery-accent-a', scheme.accentA ?? '#57068c')
    button.style.setProperty('--livery-accent-b', scheme.accentB ?? '#57068c')
    const swatch = document.createElement('span')
    swatch.className = 'f1s-garage__livery-swatch'
    const label = document.createElement('span')
    label.className = 'f1s-garage__livery-name'
    label.textContent = scheme.name
    button.append(swatch, label)
    button.addEventListener('click', () => {
      selectedFomScheme = scheme.id
      selectFomLiveryScheme(scheme.id)
      const selectedDefinition = garageOptions[selectedIndex].definition
      if (selectedDefinition.livery === 'fom-special' || selectedDefinition.livery === 'fom-partner') {
        fomLiveries.get(selectedDefinition.id)?.setScheme(scheme.id)
      }
      updateLiveryButtons()
      renderer.shadowMap.needsUpdate = true
    })
    liveryButtons.set(scheme.id, button)
    liveriesEl.appendChild(button)
  }
  updateLiveryButtons()
  const railOptionButtons = new Map<string, HTMLButtonElement>()
  let selectionVersion = 0
  const showSelection = (index: number): void => {
    selectedIndex = (index + garageOptions.length) % garageOptions.length
    const option = garageOptions[selectedIndex]
    const definition = option.definition
    const version = ++selectionVersion
    host.dataset.selectedCar = option.key
    host.style.setProperty('--garage-accent', option.accent)
    nameEl.textContent = option.name
    modelEl.textContent = option.model
    countEl.textContent = `${selectedIndex + 1} / ${garageOptions.length}`
    for (const [key, button] of railOptionButtons) {
      const active = key === option.key
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
      if (active) button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
    if (option.themeColor) {
      selectedFomColor = option.themeColor
      selectFomThemeColor(option.themeColor)
      updateColorButtons()
    }
    colorsEl.hidden = definition.id !== 'creator'
    liveriesEl.hidden = definition.livery !== 'fom-special'
      && definition.livery !== 'fom-partner'
    diyEl.hidden = definition.id !== 'audi'
    controls.autoRotate = false
    if (currentModel) {
      clearCustomLivery(scene, currentModel)
      currentModel.visible = false
    }
    void loadCar(definition).then((model) => {
      if (destroyed || version !== selectionVersion) return
      currentModel = model
      currentModel.visible = true
      if (!currentModel.parent) scene.add(currentModel)
      if (definition.id === 'creator') {
        applyFomThemeColor(currentModel, selectedFomColor)
      }
      if (definition.livery === 'fom-special' || definition.livery === 'fom-partner') {
        fomLiveries.get(definition.id)?.setScheme(selectedFomScheme)
      }
      if (definition.id === 'audi') {
        void applyCustomLivery(scene, currentModel).then((applied) => {
          if (destroyed || version !== selectionVersion) return
          logoStatus.textContent = applied
            ? '自定义车衣已贴合'
            : storage.getCustomLogo()
              ? '图片无法贴合当前底模'
              : 'PNG / JPG / WebP'
        }).catch((error) => {
          console.warn('[F1S] garage custom livery failed:', error)
        })
      }
      frameModel(currentModel)
      renderer.shadowMap.needsUpdate = true
      if (captureMode) {
        window.requestAnimationFrame(() => {
          renderer.render(scene, camera)
          document.body.dataset.captureReady = 'true'
        })
      }
    }).catch((error) => {
      console.warn('[F1S] garage car load failed:', definition.id, error)
    })
  }

  for (const [index, option] of garageOptions.entries()) {
    const carButton = document.createElement('button')
    carButton.className = 'f1s-garage__car-option'
    carButton.type = 'button'
    carButton.setAttribute('aria-label', `选择${option.name}`)
    carButton.style.setProperty('--car-accent', option.accent)
    const code = document.createElement('span')
    code.className = 'f1s-garage__car-code'
    code.textContent = option.code
    const label = document.createElement('span')
    label.className = 'f1s-garage__car-label'
    label.textContent = option.name
    carButton.append(code, label)
    carButton.addEventListener('click', () => showSelection(index))
    railEl.appendChild(carButton)
    railOptionButtons.set(option.key, carButton)
  }

  const previous = (): void => showSelection(selectedIndex - 1)
  const next = (): void => showSelection(selectedIndex + 1)
  host.querySelector<HTMLButtonElement>('.f1s-garage__arrow--prev')!.addEventListener('click', previous)
  host.querySelector<HTMLButtonElement>('.f1s-garage__arrow--next')!.addEventListener('click', next)

  uploadLogoButton.addEventListener('click', () => logoInput.click())
  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0]
    logoInput.value = ''
    if (!file) return
    logoStatus.textContent = '正在处理…'
    void prepareCustomLogo(file).then(async (dataUrl) => {
      storage.setCustomLogo(dataUrl)
      logoPreview.src = dataUrl
      logoPreview.hidden = false
      const audiIndex = PLAYER_CARS.findIndex((car) => car.id === 'audi')
      if (selectedIndex !== audiIndex) {
        logoStatus.textContent = '正在切换 Audi DIY…'
        showSelection(audiIndex)
        return
      }
      const applied = currentModel
        ? await applyCustomLivery(scene, currentModel, dataUrl)
        : false
      logoStatus.textContent = applied ? '自定义车衣已贴合' : '正在加载 Audi DIY…'
      renderer.shadowMap.needsUpdate = true
    }).catch((error) => {
      logoStatus.textContent = error instanceof Error ? error.message : '上传失败'
      console.warn('[F1S] custom logo upload failed:', error)
    })
  })
  clearLogoButton.addEventListener('click', () => {
    storage.setCustomLogo(null)
    logoPreview.removeAttribute('src')
    logoPreview.hidden = true
    if (currentModel) clearCustomLivery(scene, currentModel)
    logoStatus.textContent = '已清除'
    renderer.shadowMap.needsUpdate = true
  })

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') previous()
    else if (event.key === 'ArrowRight') next()
  }
  window.addEventListener('keydown', onKeyDown)

  let frame = 0
  let lastRenderAt = 0
  const render = (now = 0): void => {
    if (destroyed) return
    frame = window.requestAnimationFrame(render)
    if (mobileGpu && now - lastRenderAt < 1000 / 30) return
    lastRenderAt = now
    fomLiveries.get(garageOptions[selectedIndex].definition.id)?.update(now)
    controls.update()
    renderer.render(scene, camera)
  }
  const resize = (): void => {
    const width = Math.max(1, canvasHost.clientWidth)
    const height = Math.max(1, canvasHost.clientHeight)
    camera.fov = 34
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileGpu ? 1 : 1.35))
    renderer.setSize(width, height, false)
  }
  window.addEventListener('resize', resize)
  resize()
  render()
  showSelection(selectedIndex)

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }
  const preloadRemaining = (): void => {
    const selectedDefinition = garageOptions[selectedIndex].definition
    const scheduledUrls = new Set([selectedDefinition.url])
    for (const definition of PLAYER_CARS) {
      if (definition.id === selectedDefinition.id || scheduledUrls.has(definition.url)) continue
      scheduledUrls.add(definition.url)
      void loadCar(definition).catch(() => { /* Loaded on demand if idle preload fails. */ })
    }
  }
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(preloadRemaining, { timeout: 1400 })
  else window.setTimeout(preloadRemaining, 700)

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    selectionVersion++
    window.cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    controls.dispose()
    if (currentModel) clearCustomLivery(scene, currentModel)
    for (const livery of fomLiveries.values()) livery.dispose()
    fomLiveries.clear()
    for (const model of loaded.values()) disposeModel(model)
    loaded.clear()
    floor.geometry.dispose()
    floorMaterial.dispose()
    platform.geometry.dispose()
    platformMaterial.dispose()
    environmentTarget.dispose()
    dracoLoader.dispose()
    renderer.dispose()
    document.body.classList.remove('f1s-garage-active')
    host.remove()
  }

  if (onBack) {
    host.appendChild(createPageBackButton(() => {
      destroy()
      onBack()
    }, '返回玩法指南'))
  }

  host.querySelector<HTMLButtonElement>('.f1s-garage__continue')!.addEventListener('click', () => {
    const selected = playerCarById(garageOptions[selectedIndex].definition.id)
    selectPlayerCar(selected.id)
    host.classList.add('f1s-garage--leaving')
    window.setTimeout(() => {
      destroy()
      onConfirm(selected.id)
    }, 280)
  }, { once: true })

  return { destroy }
}
