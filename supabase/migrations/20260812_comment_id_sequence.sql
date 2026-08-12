do $$
declare
  seq_name text;
  identity_generation text;
  next_id bigint;
begin
  select c.identity_generation
    into identity_generation
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'comment'
    and c.column_name = 'id';

  select pg_get_serial_sequence('public.comment', 'id')
    into seq_name;

  next_id := coalesce((select max(id) from public.comment), 0) + 1;

  if identity_generation is not null then
    execute format('select setval(%L, %s, false)', seq_name, next_id);
    return;
  end if;

  if seq_name is null then
    create sequence if not exists public.comment_id_seq;
    seq_name := 'public.comment_id_seq';
  end if;

  execute format('select setval(%L, %s, false)', seq_name, next_id);
  execute format(
    'alter table public.comment alter column id set default nextval(%L)',
    seq_name
  );
end $$;
