import { Room, Client } from "@colyseus/core";
import { Schema, type, MapSchema } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
}

export class OfficeState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

export type HelloJoinOptions = {
  displayName?: string;
  workspaceId?: string;
};

export class OfficeRoom extends Room<{ state: OfficeState }> {
  override onCreate(): void {
    this.setState(new OfficeState());
    this.onMessage("ping", (client: Client) => {
      client.send("pong", { ok: true });
    });
  }

  override onJoin(client: Client, options: HelloJoinOptions = {}): void {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = String(options.displayName ?? "guest").slice(0, 40);
    this.state.players.set(client.sessionId, player);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }
}
