-- Allow Billing Store to record explicit release handbacks to Dev Panel.
-- Forward-only constraint update; existing event history is preserved.

alter table public.panel_release_events
  drop constraint if exists panel_release_events_event_type_check;

alter table public.panel_release_events
  add constraint panel_release_events_event_type_check
  check (event_type in (
    'rolled_back',
    'rollback_failed',
    'reverted',
    'revert_failed',
    'archived',
    'returned_to_dev'
  ));
