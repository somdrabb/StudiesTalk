ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS start_time TEXT,
  ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS checkin_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS checkin_code_expires_at TEXT,
  ADD COLUMN IF NOT EXISTS checkin_code_created_at TEXT;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS checked_in_at TEXT,
  ADD COLUMN IF NOT EXISTS checkin_method TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS certificate_file_id TEXT REFERENCES files_registry(file_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_records_status_check'
  ) THEN
    ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_status_check;
  END IF;
END $$;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('present', 'late', 'absent', 'excused'));

CREATE INDEX IF NOT EXISTS idx_att_records_certificate
  ON attendance_records(certificate_file_id);
