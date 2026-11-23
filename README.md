# Bleach Idle Online

Idle MMO de navegador inspirado no gênero de PokeIdle e DigiIdle: caça automática, progressão,
treino offline e, nas próximas fases, recrutamento, mercado entre jogadores, guildas e PvP.

> **Fangame não oficial.** Bleach e todos os nomes e personagens relacionados pertencem a Tite Kubo,
> Shueisha, TV Tokyo, Dentsu, Pierrot e demais detentores originais. Este projeto não tem vínculo com eles.
> Todo o código e a arte deste repositório são próprios; nada foi copiado dos jogos de referência.

## Stack

| Camada | Escolha |
| --- | --- |
| Linguagem | TypeScript em monorepo (npm workspaces) |
| Cliente | Vite + PixiJS (cena) + HTML/CSS (painéis) |
| Tempo real | WebSocket (`ws`), mensagens JSON tipadas em `@bio/shared` |
| Servidor | Node 22 + Fastify; lógica de jogo autoritativa (o cliente só envia intenções) |
| Banco | PostgreSQL (contas, jogadores, mercado com escrow) + Redis (ranking; chat e filas depois) |
| Hospedagem | Docker Compose, Caddy como proxy reverso, Cloudflare na frente |

## Estrutura

```
packages/shared   protocolo, conteúdo (zonas e inimigos), fórmulas puras, aviso de fangame
apps/server       servidor do jogo: World (tick de caça), WebSocket, PostgreSQL, Redis, migrações
apps/client       cliente Vite + PixiJS
infra/            Caddyfile e Dockerfile do front
```

## Rodando localmente

Requer Node 22+.

```bash
npm install
npm run dev          # servidor em :3001 e cliente em http://localhost:5173
```

Sem `DATABASE_URL` o servidor usa memória (dados somem ao reiniciar). Para usar PostgreSQL e Redis:

```bash
docker compose up -d postgres redis
cp .env.example .env   # e exporte as variáveis, ou defina no shell
DATABASE_URL=postgres://bleach:bleach@localhost:5432/bleach REDIS_URL=redis://localhost:6379 npm run dev
```

As migrações em `apps/server/migrations` rodam sozinhas na subida do servidor (ou com `npm run db:migrate`).

### Tudo em Docker

```bash
docker compose up --build    # http://localhost:8080
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor + cliente com recarga |
| `npm test` | testes (Vitest) de fórmulas, protocolo, caça e mundo |
| `npm run typecheck` | checagem de tipos de todos os pacotes |
| `npm run build` | build de produção |

## O que já funciona

- Login como convidado (nome único; token de sessão salvo no navegador, só o hash no banco).
- Caça automática: a cada tick (1 s) o Shinigami ataca o Hollow atual; abates dão XP e Kan; sobe de nível.
- Câmera isométrica: mapa de tiles em losango (2:1) com ordem de profundidade, tile sob o mouse destacado (conversão tela → tile em `@bio/shared` iso.ts), câmera que segue o Shinigami, zoom (+/−, roda do mouse) e WASD/setas para olhar em volta (volta sozinha). Andar até o alvo ainda é só visual no cliente.
- Zonas com nível mínimo (Karakura Town, Rukongai, Floresta de Menos, Hueco Mundo).
- Meditação (treino offline): ao voltar, ganha 25% da taxa online por até 8 h, calculado no servidor.
- Uma sessão por conta, limite de mensagens por conexão, validação de toda mensagem do cliente.
- Gravação periódica no PostgreSQL e ranking por nível no Redis.

## Próximos passos

Fase 1: recrutamento de espíritos e esquadrão de 5, despertar (Shikai/Bankai), itens, login por e-mail
e Discord, VIP e Passe. Fase 2: mercado com escrow (tabelas já no schema), chat, guildas, PvP e chefes.
Saque em dinheiro real só depois do beta e de orientação jurídica.
