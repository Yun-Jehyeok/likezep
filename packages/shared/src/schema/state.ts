export interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  micOn: boolean;
  camOn: boolean;
}

export interface RoomStateData {
  players: Map<string, PlayerData>;
  activeScreenshareUserId: string | null;
}
