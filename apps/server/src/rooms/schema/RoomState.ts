import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  id: string = "";
  name: string = "";
  x: number = 400;
  y: number = 300;
}
defineTypes(Player, { id: "string", name: "string", x: "number", y: "number" });

export class ProximityRoomState extends Schema {
  players = new MapSchema<Player>();
}
defineTypes(ProximityRoomState, { players: { map: Player } });
