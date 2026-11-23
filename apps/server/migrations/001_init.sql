-- Esquema inicial do Bleach Idle Online.
-- Requer PostgreSQL 13+ (gen_random_uuid nativo).
-- Tabelas marcadas como STUB existem para fixar o modelo; o código ainda não as usa.

-- Contas ---------------------------------------------------------------------

CREATE TABLE accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Conta convidada: só o hash SHA-256 do token de sessão.
  guest_token_hash  text UNIQUE,
  -- Login por e-mail (argon2) e OAuth entram depois.
  email             text,
  password_hash     text,
  discord_id        text UNIQUE,
  google_id         text UNIQUE,
  birthdate         date,          -- jogo 18+ quando houver dinheiro real
  banned_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email_lower_uq ON accounts (lower(email)) WHERE email IS NOT NULL;

-- Jogador (Shinigami) --------------------------------------------------------

CREATE TABLE players (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  level         int  NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp            bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  kan           bigint NOT NULL DEFAULT 0 CHECK (kan >= 0),        -- moeda comum
  crystals      bigint NOT NULL DEFAULT 0 CHECK (crystals >= 0),   -- moeda premium (loja), STUB
  zone_id       text NOT NULL,
  vip_until     timestamptz,                                       -- STUB
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_name_lower_uq ON players (lower(name));
CREATE INDEX players_account_idx ON players (account_id);

-- Espíritos recrutados e esquadrão (STUB) -------------------------------------

CREATE TABLE spirits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL enquanto estiver em escrow no mercado.
  owner_id      uuid REFERENCES players(id) ON DELETE CASCADE,
  species_id    text NOT NULL,
  level         int  NOT NULL DEFAULT 1,
  xp            bigint NOT NULL DEFAULT 0,
  awakening     smallint NOT NULL DEFAULT 0 CHECK (awakening BETWEEN 0 AND 2), -- Selada, Shikai, Bankai
  purity        numeric(3,2) NOT NULL CHECK (purity BETWEEN 1 AND 5),          -- nota 1 a 5
  affinities    jsonb NOT NULL DEFAULT '{}',
  resonant      boolean NOT NULL DEFAULT false,                                -- variante rara
  squad_slot    smallint CHECK (squad_slot BETWEEN 1 AND 5),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX spirits_squad_slot_uq ON spirits (owner_id, squad_slot) WHERE squad_slot IS NOT NULL;

-- Inventário (STUB) ----------------------------------------------------------

CREATE TABLE inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid REFERENCES players(id) ON DELETE CASCADE, -- NULL = em escrow
  item_def_id   text NOT NULL,
  quantity      int  NOT NULL CHECK (quantity > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_owner_idx ON inventory_items (owner_id);

-- Livro-razão de moedas (STUB) ----------------------------------------------
-- Toda mudança de saldo relevante (mercado, loja) gera uma linha aqui para auditoria.

CREATE TABLE currency_ledger (
  id          bigserial PRIMARY KEY,
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  currency    text NOT NULL CHECK (currency IN ('kan', 'crystals')),
  delta       bigint NOT NULL,
  reason      text NOT NULL,        -- ex.: market_sale, market_buy, market_fee, shop
  ref_id      uuid,                 -- id do anúncio, pedido etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_ledger_player_idx ON currency_ledger (player_id, created_at DESC);

-- Mercado com escrow (STUB) --------------------------------------------------
-- Ao anunciar, o item sai do dono (owner_id = NULL) e fica preso ao anúncio.
-- Na venda, em uma transação: comprador paga, vendedor recebe preço - taxa,
-- o item vai para o comprador e o anúncio vira 'sold'. Cancelar devolve o item.

CREATE TABLE market_listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES players(id),
  spirit_id     uuid REFERENCES spirits(id),
  item_id       uuid REFERENCES inventory_items(id),
  price         bigint NOT NULL CHECK (price > 0),
  currency      text NOT NULL DEFAULT 'kan' CHECK (currency IN ('kan')), -- moeda sacável só na fase 3
  fee_bps       int  NOT NULL DEFAULT 1000 CHECK (fee_bps BETWEEN 0 AND 5000), -- 10%
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
  closed_at     timestamptz,
  CHECK ((spirit_id IS NULL) <> (item_id IS NULL))
);
CREATE INDEX market_listings_active_idx ON market_listings (status, created_at DESC) WHERE status = 'active';
-- Um mesmo objeto não pode estar em dois anúncios ativos.
CREATE UNIQUE INDEX market_listings_spirit_active_uq ON market_listings (spirit_id) WHERE status = 'active';
CREATE UNIQUE INDEX market_listings_item_active_uq ON market_listings (item_id) WHERE status = 'active';

CREATE TABLE market_trades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    uuid NOT NULL UNIQUE REFERENCES market_listings(id),
  buyer_id      uuid NOT NULL REFERENCES players(id),
  price         bigint NOT NULL,
  fee           bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
