/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- each interface
 * declares exactly the fields the @type setter below provides; schema.test.ts pins the names. */
import { MapSchema, Schema, type } from "@colyseus/schema";
import type { Pose, Status } from "@office/shared";

/**
 * The synced state, mirroring `PlayerView` and `NpcView` in `packages/shared/src/net` field
 * for field (`schema.test.ts` keeps the names equal). Two types do not survive the wire:
 *
 * - `activity` is always an `ActivityState`: a null child schema crashes the 5.0.42
 *   encoder, so `kind ""` means no activity (`PlayerView.activity` null).
 * - `zoneId` is a plain string because @colyseus/schema has no nullable primitive: `""`
 *   means no zone (`PlayerView.zoneId` null). The client maps both back.
 *
 * Why this file looks unusual: `@type` installs its getter/setter on the prototype, and
 * the value only lands in the tracked store when an assignment reaches that setter. The
 * repo compiles with `useDefineForClassFields` (and tsx defines declared fields no matter
 * what the tsconfig says), so a declared field becomes an own data property that shadows
 * the setter: change tracking silently breaks and the encoder crashes on the first join.
 * Hence the shape below: an interface carries the types (erased, so nothing can shadow
 * anything), the `@type` calls run as plain code after each class, and the constructor
 * assigns every field through the prototype setter. Keep it that way: do not turn these
 * into decorated declarations.
 */

export interface LookState {
  body: string;
  top: string;
  accent: string;
  bottom: string;
  shoes: string;
  height: number;
}
export class LookState extends Schema {
  constructor() {
    super();
    this.body = "";
    this.top = "";
    this.accent = "";
    this.bottom = "";
    this.shoes = "";
    this.height = 0;
  }
}
type("string")(LookState.prototype, "body");
type("string")(LookState.prototype, "top");
type("string")(LookState.prototype, "accent");
type("string")(LookState.prototype, "bottom");
type("string")(LookState.prototype, "shoes");
type("number")(LookState.prototype, "height");

export interface ActivityState {
  kind: string;
  targetId: string;
}
export class ActivityState extends Schema {
  constructor() {
    super();
    this.kind = "";
    this.targetId = "";
  }
}
type("string")(ActivityState.prototype, "kind");
type("string")(ActivityState.prototype, "targetId");

export interface PlayerState {
  id: string;
  userId: string;
  name: string;
  look: LookState;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  speed: number;
  activity: ActivityState;
  status: Status;
  zoneId: string;
  lastSeq: number;
}
export class PlayerState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.userId = "";
    this.name = "";
    this.look = new LookState();
    this.x = 0;
    this.z = 0;
    this.facing = 0;
    this.pose = "stand";
    this.speed = 0;
    this.activity = new ActivityState();
    this.status = "available";
    this.zoneId = "";
    this.lastSeq = 0;
  }
}
type("string")(PlayerState.prototype, "id");
type("string")(PlayerState.prototype, "userId");
type("string")(PlayerState.prototype, "name");
type(LookState)(PlayerState.prototype, "look");
type("number")(PlayerState.prototype, "x");
type("number")(PlayerState.prototype, "z");
type("number")(PlayerState.prototype, "facing");
type("string")(PlayerState.prototype, "pose");
type("number")(PlayerState.prototype, "speed");
type(ActivityState)(PlayerState.prototype, "activity");
type("string")(PlayerState.prototype, "status");
type("string")(PlayerState.prototype, "zoneId");
type("number")(PlayerState.prototype, "lastSeq");

export interface NpcState {
  id: string;
  name: string;
  look: LookState;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  speed: number;
}
export class NpcState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.name = "";
    this.look = new LookState();
    this.x = 0;
    this.z = 0;
    this.facing = 0;
    this.pose = "stand";
    this.speed = 0;
  }
}
type("string")(NpcState.prototype, "id");
type("string")(NpcState.prototype, "name");
type(LookState)(NpcState.prototype, "look");
type("number")(NpcState.prototype, "x");
type("number")(NpcState.prototype, "z");
type("number")(NpcState.prototype, "facing");
type("string")(NpcState.prototype, "pose");
type("number")(NpcState.prototype, "speed");

export interface OfficeState {
  players: MapSchema<PlayerState>;
  npcs: MapSchema<NpcState>;
}
export class OfficeState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema<PlayerState>();
    this.npcs = new MapSchema<NpcState>();
  }
}
type({ map: PlayerState })(OfficeState.prototype, "players");
type({ map: NpcState })(OfficeState.prototype, "npcs");
