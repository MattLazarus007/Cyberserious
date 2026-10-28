alter table notification_runs drop constraint notification_runs_channel_check;
alter table notification_runs add constraint notification_runs_channel_check
  check (channel in ('email','sms','phone','letter','website','news'));

alter table notification_deliveries drop constraint notification_deliveries_channel_check;
alter table notification_deliveries add constraint notification_deliveries_channel_check
  check (channel in ('email','sms','phone','letter','website','news'));
