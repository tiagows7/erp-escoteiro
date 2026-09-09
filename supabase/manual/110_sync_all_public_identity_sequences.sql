-- Sincroniza todas as sequences/identities do schema public.
-- Importações com IDs explícitos não avançam automaticamente as sequences.

do $$
declare
  item record;
  max_id bigint;
  seq_last bigint;
  seq_called boolean;
begin
  for item in
    select
      cls.relname as table_name,
      att.attname as column_name,
      pg_get_serial_sequence(
        format('%I.%I', ns.nspname, cls.relname),
        att.attname
      ) as sequence_name
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_attribute att on att.attrelid = cls.oid
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and att.attnum > 0
      and not att.attisdropped
      and pg_get_serial_sequence(
        format('%I.%I', ns.nspname, cls.relname),
        att.attname
      ) is not null
    order by cls.relname, att.attname
  loop
    execute format(
      'lock table public.%I in access exclusive mode',
      item.table_name
    );
    execute format(
      'select max(%I)::bigint from public.%I',
      item.column_name,
      item.table_name
    ) into max_id;

    if max_id is null then
      continue;
    end if;

    execute format(
      'select last_value::bigint, is_called from %s',
      item.sequence_name
    ) into seq_last, seq_called;

    if (seq_called and seq_last < max_id)
       or (not seq_called and seq_last <= max_id) then
      perform setval(item.sequence_name::regclass, max_id, true);
    end if;
  end loop;
end;
$$;
