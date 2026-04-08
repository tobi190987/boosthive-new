-- Enable Supabase Realtime for the notifications table
-- Required for useRealtimeSubscription hook (postgres_changes events)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
