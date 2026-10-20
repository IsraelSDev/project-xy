export { resolveCollisions } from './collision.ts';
export { length, normalize, type Box2, type Vec2 } from './geometry.ts';
export {
  DANCE_FLOOR,
  OBSTACLES,
  PROPS,
  ROOM,
  SEAT_REACH,
  SEATS,
  SPAWN,
  SPAWN_POINTS,
  WALLS,
  nearestFreeSeat,
  pickSpawn,
  type Prop,
  type PropKind,
  type Seat,
} from './lounge-layout.ts';
export {
  obstaclesOf,
  pickSpawn as pickSpawnScene,
  nearestFreeSeat as nearestFreeSeatScene,
  type RoomLayout,
  type Seat as SceneSeat,
  LOUNGE,
  CLUB,
  BEACH,
  PRIVATE_ROOM,
  SCENES,
  sceneByName,
  SCENE_NAMES,
  sceneDisplayName,
} from './scenes.ts';
export {
  DEFAULT_MOVEMENT,
  stepMovement,
  turnTowards,
  wrapAngle,
  type MovementConfig,
  type MovementState,
} from './movement.ts';
export { PAIR_POSES, partnerPlacement, type PairPlacement, type PairPose } from './pair-poses.ts';
