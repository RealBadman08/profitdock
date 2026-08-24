create extension if not exists pgcrypto;

create table if not exists public.copy_trading_account_secrets (
    id uuid primary key default gen_random_uuid(),
    owner_deriv_account_id text not null,
    deriv_account_id text not null,
    token_ciphertext text not null,
    token_iv text not null,
    token_tag text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_deriv_account_id, deriv_account_id)
);

create table if not exists public.copy_trading_accounts (
    id uuid primary key default gen_random_uuid(),
    owner_deriv_account_id text not null,
    deriv_account_id text not null,
    account_name text not null,
    account_type text not null check (account_type in ('real', 'demo', 'virtual', 'unknown')),
    currency text not null default '',
    balance numeric(18, 8) not null default 0,
    copy_trading_enabled boolean not null default false,
    connection_status text not null default 'connected'
        check (connection_status in ('connected', 'authentication_expired', 'deleted')),
    credential_secret_id uuid not null references public.copy_trading_account_secrets(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    unique (owner_deriv_account_id, deriv_account_id)
);

create index if not exists idx_copy_trading_accounts_owner
    on public.copy_trading_accounts (owner_deriv_account_id)
    where deleted_at is null;

create index if not exists idx_copy_trading_accounts_eligible_recipients
    on public.copy_trading_accounts (owner_deriv_account_id, account_type, connection_status, copy_trading_enabled)
    where deleted_at is null;

create index if not exists idx_copy_trading_secrets_owner
    on public.copy_trading_account_secrets (owner_deriv_account_id, deriv_account_id);

alter table public.copy_trading_account_secrets enable row level security;
alter table public.copy_trading_accounts enable row level security;

revoke all on public.copy_trading_account_secrets from anon, authenticated;
revoke all on public.copy_trading_accounts from anon, authenticated;
grant all on public.copy_trading_account_secrets to service_role;
grant all on public.copy_trading_accounts to service_role;

create or replace function public.set_copy_trading_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_copy_trading_account_secrets_updated_at on public.copy_trading_account_secrets;
create trigger set_copy_trading_account_secrets_updated_at
before update on public.copy_trading_account_secrets
for each row
execute function public.set_copy_trading_updated_at();

drop trigger if exists set_copy_trading_accounts_updated_at on public.copy_trading_accounts;
create trigger set_copy_trading_accounts_updated_at
before update on public.copy_trading_accounts
for each row
execute function public.set_copy_trading_updated_at();

revoke execute on function public.set_copy_trading_updated_at() from public;
grant execute on function public.set_copy_trading_updated_at() to service_role;
