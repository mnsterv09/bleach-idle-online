/** localStorage pode falhar (aba anônima, bloqueio). O jogo funciona sem ele. */
const KEY = "bio.token";

export function loadToken(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // sem persistência: o jogador vira convidado novo ao recarregar
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
