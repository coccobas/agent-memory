-- Migration 0014: Add FTS5 Full-Text Search Table for Experiences
-- Adds virtual FTS5 table for fast text search on experiences

-- FTS5 virtual table for experiences
CREATE VIRTUAL TABLE IF NOT EXISTS experiences_fts USING fts5(
  experience_id UNINDEXED,
  title,
  content,
  scenario,
  outcome,
  pattern,
  applicability,
  tokenize = 'porter unicode61'
);

-- Triggers to keep experiences_fts in sync
CREATE TRIGGER IF NOT EXISTS experiences_fts_insert AFTER INSERT ON experiences
BEGIN
  INSERT INTO experiences_fts(experience_id, title, content, scenario, outcome, pattern, applicability)
  SELECT NEW.id, NEW.title,
    COALESCE(ev.content, ''),
    COALESCE(ev.scenario, ''),
    COALESCE(ev.outcome, ''),
    COALESCE(ev.pattern, ''),
    COALESCE(ev.applicability, '')
  FROM experiences e
  LEFT JOIN experience_versions ev ON e.current_version_id = ev.id
  WHERE e.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS experiences_fts_update AFTER UPDATE OF title, current_version_id ON experiences
BEGIN
  DELETE FROM experiences_fts WHERE experience_id = NEW.id;
  INSERT INTO experiences_fts(experience_id, title, content, scenario, outcome, pattern, applicability)
  SELECT NEW.id, NEW.title,
    COALESCE(ev.content, ''),
    COALESCE(ev.scenario, ''),
    COALESCE(ev.outcome, ''),
    COALESCE(ev.pattern, ''),
    COALESCE(ev.applicability, '')
  FROM experiences e
  LEFT JOIN experience_versions ev ON e.current_version_id = ev.id
  WHERE e.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS experiences_fts_delete AFTER DELETE ON experiences
BEGIN
  DELETE FROM experiences_fts WHERE experience_id = OLD.id;
END;

-- Trigger for experience version updates
CREATE TRIGGER IF NOT EXISTS experience_versions_fts_update AFTER UPDATE OF content, scenario, outcome, pattern, applicability ON experience_versions
BEGIN
  DELETE FROM experiences_fts WHERE experience_id IN (SELECT id FROM experiences WHERE current_version_id = NEW.id);
  INSERT INTO experiences_fts(experience_id, title, content, scenario, outcome, pattern, applicability)
  SELECT e.id, e.title,
    COALESCE(NEW.content, ''),
    COALESCE(NEW.scenario, ''),
    COALESCE(NEW.outcome, ''),
    COALESCE(NEW.pattern, ''),
    COALESCE(NEW.applicability, '')
  FROM experiences e
  WHERE e.current_version_id = NEW.id;
END;

-- Populate FTS table with existing data
INSERT INTO experiences_fts(experience_id, title, content, scenario, outcome, pattern, applicability)
SELECT e.id, e.title,
  COALESCE(ev.content, ''),
  COALESCE(ev.scenario, ''),
  COALESCE(ev.outcome, ''),
  COALESCE(ev.pattern, ''),
  COALESCE(ev.applicability, '')
FROM experiences e
LEFT JOIN experience_versions ev ON e.current_version_id = ev.id
WHERE e.is_active = 1;
