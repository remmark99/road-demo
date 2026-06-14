-- Stop condition windows schema for current stop analytics.
-- Run this in Supabase SQL Editor before enabling the remote writer.

CREATE TABLE IF NOT EXISTS stop_condition_windows (
  location_id TEXT NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE,
  trash_fill_avg DOUBLE PRECISION CHECK (trash_fill_avg IS NULL OR (trash_fill_avg >= 0 AND trash_fill_avg <= 100)),
  trash_fill_max DOUBLE PRECISION CHECK (trash_fill_max IS NULL OR (trash_fill_max >= 0 AND trash_fill_max <= 100)),
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stop_condition_windows_location_start
  ON stop_condition_windows(location_id, window_start);

CREATE INDEX IF NOT EXISTS idx_stop_condition_windows_start
  ON stop_condition_windows(window_start DESC);

CREATE INDEX IF NOT EXISTS idx_stop_condition_windows_location_start_desc
  ON stop_condition_windows(location_id, window_start DESC);

ALTER TABLE stop_condition_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read stop condition windows" ON stop_condition_windows;
CREATE POLICY "Allow public read stop condition windows"
  ON stop_condition_windows
  FOR SELECT USING (true);

COMMENT ON TABLE stop_condition_windows IS 'Aggregated trash-bin fullness windows for current stop condition analytics.';
COMMENT ON COLUMN stop_condition_windows.location_id IS 'Stop analytics location id, matching busyness_windows.location_id.';
COMMENT ON COLUMN stop_condition_windows.trash_fill_avg IS 'Average trash-bin fill percentage for the window, 0-100.';
COMMENT ON COLUMN stop_condition_windows.trash_fill_max IS 'Maximum trash-bin fill percentage for the window, 0-100.';
