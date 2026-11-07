// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/illustrate.js
export { illustrating, hexToHsl, hslToHex, tint, tones, rng, nextRand, hashSeed, vary, varyTint, wobble, blob } from './illustrate-core.ts';
export type { TintOpts, Tones, Mulberry, VaryOpts, VaryResult, WobbleOpts, BlobOpts } from './illustrate-core.ts';
export { ellipseGradient, contactShadow, softSpot, finish, bodyGradient, shapeShadow, shading, ball, particles } from './illustrate-paint.ts';
export type { IllumLight, ContactShadowOpts, ShadowKind, ShadowSpec, FinishOpts, FinishResult, ShadingOpts, ParticlesOpts, ParticleItem } from './illustrate-paint.ts';
