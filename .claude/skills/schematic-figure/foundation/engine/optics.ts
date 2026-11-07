// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/optics.js
export { lens, mirror, beamSplitter, laser, camera, detector, objective } from './optics-a.ts';
export type { OpticOpts, OpticResult, LensKind, LensOpts, MirrorOpts, BeamSplitterOpts, LaserOpts, CameraOpts, DetectorOpts, ObjectiveOpts } from './optics-a.ts';
export { gaussianBeam, beam, lightCone, pulseTrain, fiber, fiberCoil, slm, grating, scatterer, speckle } from './optics-b.ts';
export type { GaussianBeamOpts, BeamOpts, LightConeOpts, PulseTrainOpts, FiberOpts, FiberCoilOpts, SlmOpts, GratingOpts, ScattererOpts, SpeckleOpts } from './optics-b.ts';
export { beamPath, beamPathAt } from './optics-c.ts';
export type { BeamPathOpts, BeamMirror, BeamPathResult } from './optics-c.ts';
export { plate, evanescent } from './optics-d.ts';
export type { PlateKind, PlateOpts, EvanescentOpts } from './optics-d.ts';
