-- Migration 0003: Add FTS5 Full-Text Search Tables
-- Adds virtual FTS5 tables for fast text search on tools, guidelines, and knowledge

-- FTS5 virtual table for tools
CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts USING fts5(
  tool_id UNINDEXED,
  name,
  description,
  tokenize = 'porter unicode61'
);

-- FTS5 virtual table for guidelines
CREATE VIRTUAL TABLE IF NOT EXISTS guidelines_fts USING fts5(
  guideline_id UNINDEXED,
  name,
  content,
  rationale,
  tokenize = 'porter unicode61'
);

-- FTS5 virtual table for knowledge
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  knowledge_id UNINDEXED,
  title,
  content,
  source,
  tokenize = 'porter unicode61'
);

-- Triggers to keep tools_fts in sync
CREATE TRIGGER IF NOT EXISTS tools_fts_insert AFTER INSERT ON tools
BEGIN
  INSERT INTO tools_fts(tool_id, name, description)
  SELECT NEW.id, NEW.name, COALESCE(tv.description, '')
  FROM tools t
  LEFT JOIN tool_versions tv ON t.current_version_id = tv.id
  WHERE t.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS tools_fts_update AFTER UPDATE OF name, current_version_id ON tools
BEGIN
  DELETE FROM tools_fts WHERE tool_id = NEW.id;
  INSERT INTO tools_fts(tool_id, name, description)
  SELECT NEW.id, NEW.name, COALESCE(tv.description, '')
  FROM tools t
  LEFT JOIN tool_versions tv ON t.current_version_id = tv.id
  WHERE t.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS tools_fts_delete AFTER DELETE ON tools
BEGIN
  DELETE FROM tools_fts WHERE tool_id = OLD.id;
END;

-- Trigger for tool version updates
CREATE TRIGGER IF NOT EXISTS tool_versions_fts_update AFTER UPDATE OF description ON tool_versions
BEGIN
  DELETE FROM tools_fts WHERE tool_id IN (SELECT id FROM tools WHERE current_version_id = NEW.id);
  INSERT INTO tools_fts(tool_id, name, description)
  SELECT t.id, t.name, COALESCE(NEW.description, '')
  FROM tools t
  WHERE t.current_version_id = NEW.id;
END;

-- Triggers to keep guidelines_fts in sync
CREATE TRIGGER IF NOT EXISTS guidelines_fts_insert AFTER INSERT ON guidelines
BEGIN
  INSERT INTO guidelines_fts(guideline_id, name, content, rationale)
  SELECT NEW.id, NEW.name, COALESCE(gv.content, ''), COALESCE(gv.rationale, '')
  FROM guidelines g
  LEFT JOIN guideline_versions gv ON g.current_version_id = gv.id
  WHERE g.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS guidelines_fts_update AFTER UPDATE OF name, current_version_id ON guidelines
BEGIN
  DELETE FROM guidelines_fts WHERE guideline_id = NEW.id;
  INSERT INTO guidelines_fts(guideline_id, name, content, rationale)
  SELECT NEW.id, NEW.name, COALESCE(gv.content, ''), COALESCE(gv.rationale, '')
  FROM guidelines g
  LEFT JOIN guideline_versions gv ON g.current_version_id = gv.id
  WHERE g.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS guidelines_fts_delete AFTER DELETE ON guidelines
BEGIN
  DELETE FROM guidelines_fts WHERE guideline_id = OLD.id;
END;

-- Trigger for guideline version updates
CREATE TRIGGER IF NOT EXISTS guideline_versions_fts_update AFTER UPDATE OF content, rationale ON guideline_versions
BEGIN
  DELETE FROM guidelines_fts WHERE guideline_id IN (SELECT id FROM guidelines WHERE current_version_id = NEW.id);
  INSERT INTO guidelines_fts(guideline_id, name, content, rationale)
  SELECT g.id, g.name, COALESCE(NEW.content, ''), COALESCE(NEW.rationale, '')
  FROM guidelines g
  WHERE g.current_version_id = NEW.id;
END;

-- Triggers to keep knowledge_fts in sync
CREATE TRIGGER IF NOT EXISTS knowledge_fts_insert AFTER INSERT ON knowledge
BEGIN
  INSERT INTO knowledge_fts(knowledge_id, title, content, source)
  SELECT NEW.id, NEW.title, COALESCE(kv.content, ''), COALESCE(kv.source, '')
  FROM knowledge k
  LEFT JOIN knowledge_versions kv ON k.current_version_id = kv.id
  WHERE k.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS knowledge_fts_update AFTER UPDATE OF title, current_version_id ON knowledge
BEGIN
  DELETE FROM knowledge_fts WHERE knowledge_id = NEW.id;
  INSERT INTO knowledge_fts(knowledge_id, title, content, source)
  SELECT NEW.id, NEW.title, COALESCE(kv.content, ''), COALESCE(kv.source, '')
  FROM knowledge k
  LEFT JOIN knowledge_versions kv ON k.current_version_id = kv.id
  WHERE k.id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS knowledge_fts_delete AFTER DELETE ON knowledge
BEGIN
  DELETE FROM knowledge_fts WHERE knowledge_id = OLD.id;
END;

-- Trigger for knowledge version updates
CREATE TRIGGER IF NOT EXISTS knowledge_versions_fts_update AFTER UPDATE OF content, source ON knowledge_versions
BEGIN
  DELETE FROM knowledge_fts WHERE knowledge_id IN (SELECT id FROM knowledge WHERE current_version_id = NEW.id);
  INSERT INTO knowledge_fts(knowledge_id, title, content, source)
  SELECT k.id, k.title, COALESCE(NEW.content, ''), COALESCE(NEW.source, '')
  FROM knowledge k
  WHERE k.current_version_id = NEW.id;
END;

-- Populate FTS tables with existing data
INSERT INTO tools_fts(tool_id, name, description)
SELECT t.id, t.name, COALESCE(tv.description, '')
FROM tools t
LEFT JOIN tool_versions tv ON t.current_version_id = tv.id
WHERE t.is_active = 1;

INSERT INTO guidelines_fts(guideline_id, name, content, rationale)
SELECT g.id, g.name, COALESCE(gv.content, ''), COALESCE(gv.rationale, '')
FROM guidelines g
LEFT JOIN guideline_versions gv ON g.current_version_id = gv.id
WHERE g.is_active = 1;

INSERT INTO knowledge_fts(knowledge_id, title, content, source)
SELECT k.id, k.title, COALESCE(kv.content, ''), COALESCE(kv.source, '')
FROM knowledge k
LEFT JOIN knowledge_versions kv ON k.current_version_id = kv.id
WHERE k.is_active = 1;
