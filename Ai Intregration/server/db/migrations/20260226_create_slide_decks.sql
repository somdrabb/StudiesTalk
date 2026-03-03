CREATE TABLE IF NOT EXISTS slide_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_class_id UUID REFERENCES live_classes(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  title TEXT,
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
