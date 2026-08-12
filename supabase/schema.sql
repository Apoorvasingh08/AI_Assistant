create extension if not exists "pgcrypto";


create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);


create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'escalated', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'ai', 'agent')),
  content text not null,
  classification text
    check (classification in ('general_question', 'technical_issue', 'billing', 'urgent')),
  confidence numeric(3,2),

  llm_failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_id on messages(conversation_id);


create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  reason text not null,
  classification text,
  notified boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_active_escalation_per_conversation
  on escalations(conversation_id)
  where notified = false;

create index if not exists idx_escalations_conversation_id on escalations(conversation_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();


alter table users enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table escalations enable row level security;

create policy "anon can read/write conversations" on conversations
  for all using (true) with check (true);

create policy "anon can read/write messages" on messages
  for all using (true) with check (true);

create policy "anon can read/write users" on users
  for all using (true) with check (true);


