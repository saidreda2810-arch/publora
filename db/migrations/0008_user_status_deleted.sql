-- WP10: self-service account deletion marks users status='deleted' (30-day recovery window).
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted';
