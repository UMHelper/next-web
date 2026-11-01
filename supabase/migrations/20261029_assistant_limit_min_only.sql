begin;

alter table public.app_config drop constraint if exists app_config_ai_quota_per_hour_check;
alter table public.app_config drop constraint if exists app_config_ai_quota_per_day_check;
alter table public.app_config drop constraint if exists app_config_ai_max_turns_check;
alter table public.app_config drop constraint if exists app_config_ai_history_turns_check;
alter table public.app_config drop constraint if exists app_config_ai_max_steps_check;
alter table public.app_config drop constraint if exists app_config_ai_max_output_tokens_check;
alter table public.app_config drop constraint if exists app_config_ai_timeout_ms_check;

alter table public.app_config
  add constraint app_config_ai_quota_per_hour_check
    check (ai_quota_per_hour is null or ai_quota_per_hour >= 1),
  add constraint app_config_ai_quota_per_day_check
    check (ai_quota_per_day is null or ai_quota_per_day >= 1),
  add constraint app_config_ai_max_turns_check
    check (ai_max_turns is null or ai_max_turns >= 1),
  add constraint app_config_ai_history_turns_check
    check (ai_history_turns is null or ai_history_turns >= 0),
  add constraint app_config_ai_max_steps_check
    check (ai_max_steps is null or ai_max_steps >= 1),
  add constraint app_config_ai_max_output_tokens_check
    check (ai_max_output_tokens is null or ai_max_output_tokens >= 1),
  add constraint app_config_ai_timeout_ms_check
    check (ai_timeout_ms is null or ai_timeout_ms >= 1);

notify pgrst, 'reload schema';

commit;
