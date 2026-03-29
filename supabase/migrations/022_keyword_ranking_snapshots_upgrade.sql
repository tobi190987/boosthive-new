-- PROJ-27 follow-up: bring existing databases to the current snapshot schema
-- This is needed because 021 was updated after some environments had already run it.

ALTER TABLE keyword_ranking_snapshots
  ADD COLUMN IF NOT EXISTS keyword_label TEXT;

UPDATE keyword_ranking_snapshots AS snapshots
SET keyword_label = keywords.keyword
FROM keywords
WHERE snapshots.keyword_id = keywords.id
  AND snapshots.keyword_label IS NULL;

UPDATE keyword_ranking_snapshots
SET keyword_label = 'Entferntes Keyword'
WHERE keyword_label IS NULL;

ALTER TABLE keyword_ranking_snapshots
  ALTER COLUMN keyword_label SET NOT NULL;

ALTER TABLE keyword_ranking_snapshots
  DROP CONSTRAINT IF EXISTS keyword_ranking_snapshots_keyword_id_fkey;

ALTER TABLE keyword_ranking_snapshots
  ADD CONSTRAINT keyword_ranking_snapshots_keyword_id_fkey
  FOREIGN KEY (keyword_id)
  REFERENCES keywords(id)
  ON DELETE SET NULL;
