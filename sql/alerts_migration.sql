-- Migration: Add camera_index to alerts table
-- Run this in Supabase SQL Editor

-- Add camera_index column
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS camera_index INTEGER;

-- Create index for camera filtering
CREATE INDEX IF NOT EXISTS idx_alerts_camera ON alerts(camera_index);

-- Create composite index for camera + time queries
CREATE INDEX IF NOT EXISTS idx_alerts_camera_time ON alerts(camera_index, timestamp DESC);

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);

-- Create composite index for pagination
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);

-- Update RLS policy to allow reading alerts (if not already set)
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON alerts;
CREATE POLICY "Allow public read access" ON alerts
  FOR SELECT USING (true);

-- Comments
COMMENT ON COLUMN alerts.camera_index IS 'Reference to cameras.camera_index';
COMMENT ON COLUMN alerts.alert_type IS 'Type: snowplow (снегоуборщик) or canny (детектор снега)';
