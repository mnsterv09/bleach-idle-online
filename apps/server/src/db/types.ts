export interface PlayerRecord {
  id: string;
  name: string;
  level: number;
  xp: number;
  kan: number;
  zoneId: string;
  lastSeenAt: Date;
}

/** Persistência de jogadores. Implementações: memória (dev/testes) e PostgreSQL. */
export interface PlayerStore {
  findByToken(token: string): Promise<PlayerRecord | null>;
  /** Cria uma conta convidada e o jogador dela. Lança NameTakenError se o nome já existir. */
  createGuest(name: string, token: string): Promise<PlayerRecord>;
  save(players: PlayerRecord[]): Promise<void>;
  close(): Promise<void>;
}

export class NameTakenError extends Error {
  constructor() {
    super("Nome já em uso");
  }
}
