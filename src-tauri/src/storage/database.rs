use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::{
    error::{AppError, AppResult},
    models::{
        Bug, Checklist, DocumentKind, DocumentVersion, InboxItem, InboxKind, KnowledgeFolder,
        KnowledgeNode, KnowledgeNodeKind, KnowledgePage, Note, PdfDocument, PdfOcrStatus, Project,
        ProjectStatus, ScheduleEvent, SearchResult, SemanticDocumentRecord, Space, SparkStage,
        TagSummary, Task, TaskPriority, TaskStatus, Template, TemplateKind, TrashItem, WikiLink,
    },
};

pub struct Database {
    conn: Connection,
}

struct SearchDocument<'a> {
    id: &'a str,
    kind: &'a str,
    title: &'a str,
    body: &'a str,
    tags: &'a [String],
    space: &'a Space,
    updated_at: &'a str,
    archived: bool,
}

impl Database {
    pub fn open(path: &std::path::Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS notes (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
               space TEXT NOT NULL, project_id TEXT, tags TEXT NOT NULL,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS tasks (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
               status TEXT NOT NULL, priority TEXT NOT NULL, due_date TEXT,
               space TEXT NOT NULL, project_id TEXT, tags TEXT NOT NULL, parent_id TEXT,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS bugs (
               id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL,
               status TEXT NOT NULL, priority TEXT NOT NULL, severity TEXT NOT NULL,
               bug_date TEXT NOT NULL, due_date TEXT, completed_date TEXT,
               space TEXT NOT NULL, project_id TEXT, module TEXT NOT NULL DEFAULT '',
               version TEXT NOT NULL DEFAULT '', assignee TEXT NOT NULL DEFAULT '',
               tags TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0,
               archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL, batch_id TEXT, row_id TEXT,
               data TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_bugs_space_status_due ON bugs(space, archived, status, due_date);
             CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, archived);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_bugs_import_row ON bugs(batch_id, row_id) WHERE batch_id IS NOT NULL AND row_id IS NOT NULL;
             CREATE TABLE IF NOT EXISTS projects (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
               status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
               space TEXT NOT NULL, tags TEXT NOT NULL,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS inbox (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
               kind TEXT NOT NULL, spark_stage TEXT, space TEXT NOT NULL, tags TEXT NOT NULL,
               archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS events (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL,
               start_time TEXT, end_time TEXT, all_day INTEGER NOT NULL DEFAULT 0,
               notes TEXT NOT NULL, task_id TEXT, project_id TEXT,
               space TEXT NOT NULL, tags TEXT NOT NULL,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS checklists (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
               items TEXT NOT NULL, space TEXT NOT NULL, tags TEXT NOT NULL,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS templates (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
               kind TEXT NOT NULL, payload TEXT NOT NULL, space TEXT NOT NULL,
               archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS knowledge_folders (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
               space TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
               archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS knowledge_pages (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
               parent_id TEXT, space TEXT NOT NULL, tags TEXT NOT NULL,
               favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS wiki_links (
               id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_kind TEXT NOT NULL,
               source_title TEXT NOT NULL, target_title TEXT NOT NULL,
               target_id TEXT, target_kind TEXT, space TEXT NOT NULL,
               resolved INTEGER NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS idx_wiki_links_source ON wiki_links(source_id, source_kind);
             CREATE INDEX IF NOT EXISTS idx_wiki_links_target ON wiki_links(target_id, target_kind);
             CREATE TABLE IF NOT EXISTS document_versions (
               id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, entity_kind TEXT NOT NULL,
               title TEXT NOT NULL, content TEXT NOT NULL, snapshot TEXT NOT NULL,
               space TEXT NOT NULL, created_at TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_document_versions_entity ON document_versions(entity_id, entity_kind, created_at DESC);
             CREATE TABLE IF NOT EXISTS trash_items (
               id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, kind TEXT NOT NULL,
               title TEXT NOT NULL, space TEXT NOT NULL, original_folder TEXT NOT NULL,
               deleted_at TEXT NOT NULL, purge_at TEXT NOT NULL, payload TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_trash_items_space ON trash_items(space, deleted_at DESC);
             CREATE TABLE IF NOT EXISTS attachments (
               id TEXT PRIMARY KEY, file_name TEXT NOT NULL, path TEXT NOT NULL,
               entity_id TEXT, space TEXT NOT NULL, created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS documents (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, file_name TEXT NOT NULL,
               relative_path TEXT NOT NULL, space TEXT NOT NULL, size INTEGER NOT NULL,
               sha256 TEXT NOT NULL, page_count INTEGER NOT NULL DEFAULT 0,
               extracted_text TEXT NOT NULL, ocr_status TEXT NOT NULL,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               device_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space, updated_at DESC);
             CREATE TABLE IF NOT EXISTS semantic_documents (
               id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
               content TEXT NOT NULL, space TEXT NOT NULL, vector TEXT NOT NULL,
               updated_at TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]'
             );
             CREATE INDEX IF NOT EXISTS idx_semantic_documents_space ON semantic_documents(space);
             CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
               id UNINDEXED, kind UNINDEXED, title, body, tags, space UNINDEXED, updated_at UNINDEXED
             );",
        )?;
        let inbox_has_spark_stage = {
            let mut statement = conn.prepare("PRAGMA table_info(inbox)")?;
            let mut rows = statement.query([])?;
            let mut found = false;
            while let Some(row) = rows.next()? {
                let name: String = row.get(1)?;
                if name == "spark_stage" {
                    found = true;
                    break;
                }
            }
            found
        };
        if !inbox_has_spark_stage {
            conn.execute("ALTER TABLE inbox ADD COLUMN spark_stage TEXT", [])?;
        }
        Ok(Self { conn })
    }

    pub fn clear_content(&self) -> AppResult<()> {
        self.conn.execute_batch("DELETE FROM notes; DELETE FROM tasks; DELETE FROM bugs; DELETE FROM projects; DELETE FROM inbox; DELETE FROM events; DELETE FROM checklists; DELETE FROM templates; DELETE FROM knowledge_folders; DELETE FROM knowledge_pages; DELETE FROM wiki_links; DELETE FROM document_versions; DELETE FROM trash_items; DELETE FROM attachments; DELETE FROM documents; DELETE FROM semantic_documents; DELETE FROM search_index;")?;
        Ok(())
    }

    pub fn clear_semantic_index(&self) -> AppResult<()> {
        self.conn.execute("DELETE FROM semantic_documents", [])?;
        Ok(())
    }

    pub fn upsert_note(&self, note: &Note) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO notes (id,title,content,space,project_id,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,space=excluded.space,project_id=excluded.project_id,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![note.id, note.title, note.content, note.space.as_str(), note.project_id, tags_json(&note.tags)?, bool_i64(note.favorite), bool_i64(note.archived), note.created_at, note.updated_at, note.device_id, note.workspace_id, note.revision],
        )?;
        self.refresh_search(SearchDocument {
            id: &note.id,
            kind: "note",
            title: &note.title,
            body: &note.content,
            tags: &note.tags,
            space: &note.space,
            updated_at: &note.updated_at,
            archived: note.archived,
        })
    }

    pub fn get_note(&self, id: &str) -> AppResult<Note> {
        self.conn.query_row("SELECT id,title,content,space,project_id,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM notes WHERE id=?1", [id], note_from_row).optional()?.ok_or_else(|| AppError::NotFound(format!("笔记 {id}")))
    }

    pub fn list_notes(&self, space: &Space, include_archived: bool) -> AppResult<Vec<Note>> {
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare("SELECT id,title,content,space,project_id,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM notes WHERE (?1 OR archived=0) ORDER BY updated_at DESC")?;
            for row in statement.query_map([bool_i64(include_archived)], note_from_row)? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare("SELECT id,title,content,space,project_id,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM notes WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC")?;
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                note_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_knowledge_folder(&self, folder: &KnowledgeFolder) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO knowledge_folders (id,name,parent_id,space,position,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id,space=excluded.space,position=excluded.position,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![
                folder.id,
                folder.name,
                folder.parent_id,
                folder.space.as_str(),
                folder.position,
                bool_i64(folder.archived),
                folder.created_at,
                folder.updated_at,
                folder.device_id,
                folder.workspace_id,
                folder.revision
            ],
        )?;
        Ok(())
    }

    pub fn get_knowledge_folder(&self, id: &str) -> AppResult<KnowledgeFolder> {
        self.conn
            .query_row(
                "SELECT id,name,parent_id,space,position,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_folders WHERE id=?1",
                [id],
                knowledge_folder_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("知识库目录 {id}")))
    }

    pub fn list_knowledge_folders(
        &self,
        space: &Space,
        include_archived: bool,
    ) -> AppResult<Vec<KnowledgeFolder>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,name,parent_id,space,position,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_folders WHERE (?1 OR archived=0) ORDER BY position, name"
        } else {
            "SELECT id,name,parent_id,space,position,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_folders WHERE space=?1 AND (?2 OR archived=0) ORDER BY position, name"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in
                statement.query_map([bool_i64(include_archived)], knowledge_folder_from_row)?
            {
                result.push(row?);
            }
        } else {
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                knowledge_folder_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_knowledge_page(&self, page: &KnowledgePage) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO knowledge_pages (id,title,content,parent_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,parent_id=excluded.parent_id,space=excluded.space,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![
                page.id,
                page.title,
                page.content,
                page.parent_id,
                page.space.as_str(),
                tags_json(&page.tags)?,
                bool_i64(page.favorite),
                bool_i64(page.archived),
                page.created_at,
                page.updated_at,
                page.device_id,
                page.workspace_id,
                page.revision
            ],
        )?;
        self.refresh_search(SearchDocument {
            id: &page.id,
            kind: "knowledge_page",
            title: &page.title,
            body: &page.content,
            tags: &page.tags,
            space: &page.space,
            updated_at: &page.updated_at,
            archived: page.archived,
        })
    }

    pub fn get_knowledge_page(&self, id: &str) -> AppResult<KnowledgePage> {
        self.conn
            .query_row(
                "SELECT id,title,content,parent_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_pages WHERE id=?1",
                [id],
                knowledge_page_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("知识库页面 {id}")))
    }

    pub fn list_knowledge_pages(
        &self,
        space: &Space,
        include_archived: bool,
    ) -> AppResult<Vec<KnowledgePage>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,title,content,parent_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_pages WHERE (?1 OR archived=0) ORDER BY updated_at DESC"
        } else {
            "SELECT id,title,content,parent_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM knowledge_pages WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([bool_i64(include_archived)], knowledge_page_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                knowledge_page_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn list_knowledge_nodes(
        &self,
        space: &Space,
        include_archived: bool,
    ) -> AppResult<Vec<KnowledgeNode>> {
        let mut nodes = self
            .list_knowledge_folders(space, include_archived)?
            .into_iter()
            .map(|folder| KnowledgeNode {
                id: folder.id,
                title: folder.name,
                kind: KnowledgeNodeKind::Folder,
                parent_id: folder.parent_id,
                space: folder.space,
                archived: folder.archived,
                updated_at: folder.updated_at,
                position: folder.position,
            })
            .collect::<Vec<_>>();
        nodes.extend(
            self.list_knowledge_pages(space, include_archived)?
                .into_iter()
                .map(|page| KnowledgeNode {
                    id: page.id,
                    title: page.title,
                    kind: KnowledgeNodeKind::Page,
                    parent_id: page.parent_id,
                    space: page.space,
                    archived: page.archived,
                    updated_at: page.updated_at,
                    position: 0,
                }),
        );
        nodes.sort_by(|left, right| {
            left.position
                .cmp(&right.position)
                .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
        });
        Ok(nodes)
    }

    pub fn upsert_task(&self, task: &Task) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO tasks (id,title,description,status,priority,due_date,space,project_id,tags,parent_id,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,due_date=excluded.due_date,space=excluded.space,project_id=excluded.project_id,tags=excluded.tags,parent_id=excluded.parent_id,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![task.id, task.title, task.description, task.status.as_str(), task.priority.as_str(), task.due_date, task.space.as_str(), task.project_id, tags_json(&task.tags)?, task.parent_id, bool_i64(task.favorite), bool_i64(task.archived), task.created_at, task.updated_at, task.device_id, task.workspace_id, task.revision],
        )?;
        self.refresh_search(SearchDocument {
            id: &task.id,
            kind: "task",
            title: &task.title,
            body: &task.description,
            tags: &task.tags,
            space: &task.space,
            updated_at: &task.updated_at,
            archived: task.archived,
        })
    }

    pub fn get_task(&self, id: &str) -> AppResult<Task> {
        self.conn.query_row("SELECT id,title,description,status,priority,due_date,space,project_id,tags,parent_id,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM tasks WHERE id=?1", [id], task_from_row).optional()?.ok_or_else(|| AppError::NotFound(format!("任务 {id}")))
    }

    pub fn list_tasks(&self, space: &Space, include_archived: bool) -> AppResult<Vec<Task>> {
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare("SELECT id,title,description,status,priority,due_date,space,project_id,tags,parent_id,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM tasks WHERE (?1 OR archived=0) ORDER BY CASE WHEN status='done' THEN 1 ELSE 0 END, due_date IS NULL, due_date, updated_at DESC")?;
            for row in statement.query_map([bool_i64(include_archived)], task_from_row)? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare("SELECT id,title,description,status,priority,due_date,space,project_id,tags,parent_id,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM tasks WHERE space=?1 AND (?2 OR archived=0) ORDER BY CASE WHEN status='done' THEN 1 ELSE 0 END, due_date IS NULL, due_date, updated_at DESC")?;
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                task_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_bug(&self, bug: &Bug) -> AppResult<()> {
        let data = serde_json::to_string(bug)?;
        let searchable = format!(
            "{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
            bug.code,
            bug.description,
            bug.notes,
            bug.environment,
            bug.module,
            bug.version,
            bug.assignee,
            bug.reporter,
            bug.activities
                .iter()
                .map(|activity| activity.message.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        );
        self.conn.execute(
            "INSERT INTO bugs (id,code,title,status,priority,severity,bug_date,due_date,completed_date,space,project_id,module,version,assignee,tags,favorite,archived,created_at,updated_at,batch_id,row_id,data)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)
             ON CONFLICT(id) DO UPDATE SET code=excluded.code,title=excluded.title,status=excluded.status,priority=excluded.priority,severity=excluded.severity,bug_date=excluded.bug_date,due_date=excluded.due_date,completed_date=excluded.completed_date,space=excluded.space,project_id=excluded.project_id,module=excluded.module,version=excluded.version,assignee=excluded.assignee,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,batch_id=excluded.batch_id,row_id=excluded.row_id,data=excluded.data",
            params![bug.id, bug.code, bug.title, bug.status.as_str(), bug.priority.as_str(), bug.severity.as_str(), bug.bug_date, bug.due_date, bug.completed_date, bug.space.as_str(), bug.project_id, bug.module, bug.version, bug.assignee, tags_json(&bug.tags)?, bool_i64(bug.favorite), bool_i64(bug.archived), bug.created_at, bug.updated_at, bug.source.batch_id, bug.source.row_id, data],
        )?;
        self.refresh_search(SearchDocument {
            id: &bug.id,
            kind: "bug",
            title: &bug.title,
            body: &searchable,
            tags: &bug.tags,
            space: &bug.space,
            updated_at: &bug.updated_at,
            archived: bug.archived,
        })
    }

    pub fn get_bug(&self, id: &str) -> AppResult<Bug> {
        let data: String = self
            .conn
            .query_row("SELECT data FROM bugs WHERE id=?1", [id], |row| row.get(0))
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("BUG {id}")))?;
        Ok(serde_json::from_str(&data)?)
    }

    pub fn list_bugs(&self, space: &Space, include_archived: bool) -> AppResult<Vec<Bug>> {
        let query = if space == &Space::All {
            "SELECT data FROM bugs WHERE (?1 OR archived=0) ORDER BY updated_at DESC"
        } else {
            "SELECT data FROM bugs WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        let mut bugs = Vec::new();
        if space == &Space::All {
            for row in
                statement.query_map([bool_i64(include_archived)], |row| row.get::<_, String>(0))?
            {
                bugs.push(serde_json::from_str::<Bug>(&row?)?);
            }
        } else {
            for row in statement
                .query_map(params![space.as_str(), bool_i64(include_archived)], |row| {
                    row.get::<_, String>(0)
                })?
            {
                bugs.push(serde_json::from_str::<Bug>(&row?)?);
            }
        }
        Ok(bugs)
    }

    pub fn find_imported_bug(&self, batch_id: &str, row_id: &str) -> AppResult<Option<Bug>> {
        let data = self
            .conn
            .query_row(
                "SELECT data FROM bugs WHERE batch_id=?1 AND row_id=?2",
                params![batch_id, row_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        data.map(|data| serde_json::from_str(&data).map_err(AppError::from))
            .transpose()
    }

    pub fn find_imported_bug_in_trash(
        &self,
        batch_id: &str,
        row_id: &str,
    ) -> AppResult<Option<Bug>> {
        let mut statement = self
            .conn
            .prepare("SELECT payload FROM trash_items WHERE kind='bug'")?;
        let payloads = statement.query_map([], |row| row.get::<_, String>(0))?;
        for payload in payloads {
            let payload = payload?;
            let value: serde_json::Value = serde_json::from_str(&payload)?;
            let bug: Bug = serde_json::from_value(value)?;
            if bug.source.batch_id.as_deref() == Some(batch_id)
                && bug.source.row_id.as_deref() == Some(row_id)
            {
                return Ok(Some(bug));
            }
        }
        Ok(None)
    }

    pub fn code_exists(&self, code: &str) -> AppResult<bool> {
        Ok(self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM bugs WHERE code=?1)",
            [code],
            |row| row.get::<_, bool>(0),
        )?)
    }

    pub fn delete_bug(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("bugs", id)
    }

    pub fn remove_bug_search(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM search_index WHERE id=?1 AND kind='bug'", [id])?;
        Ok(())
    }

    pub fn bug_tags(&self, space: &Space) -> AppResult<Vec<String>> {
        self.collect_tag_json("bugs", "tags", space)
    }

    pub fn upsert_project(&self, project: &Project) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO projects (id,name,description,status,progress,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status,progress=excluded.progress,space=excluded.space,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![project.id, project.name, project.description, project.status.as_str(), project.progress.clamp(0, 100), project.space.as_str(), tags_json(&project.tags)?, bool_i64(project.favorite), bool_i64(project.archived), project.created_at, project.updated_at, project.device_id, project.workspace_id, project.revision],
        )?;
        self.refresh_search(SearchDocument {
            id: &project.id,
            kind: "project",
            title: &project.name,
            body: &project.description,
            tags: &project.tags,
            space: &project.space,
            updated_at: &project.updated_at,
            archived: project.archived,
        })
    }

    pub fn get_project(&self, id: &str) -> AppResult<Project> {
        self.conn.query_row("SELECT id,name,description,status,progress,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM projects WHERE id=?1", [id], project_from_row).optional()?.ok_or_else(|| AppError::NotFound(format!("项目 {id}")))
    }

    pub fn list_projects(&self, space: &Space, include_archived: bool) -> AppResult<Vec<Project>> {
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare("SELECT id,name,description,status,progress,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM projects WHERE (?1 OR archived=0) ORDER BY updated_at DESC")?;
            for row in statement.query_map([bool_i64(include_archived)], project_from_row)? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare("SELECT id,name,description,status,progress,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM projects WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC")?;
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                project_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_inbox(&self, item: &InboxItem) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO inbox (id,title,body,kind,spark_stage,space,tags,archived,created_at,updated_at,device_id,workspace_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,kind=excluded.kind,spark_stage=excluded.spark_stage,space=excluded.space,tags=excluded.tags,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id",
            params![item.id, item.title, item.body, item.kind.as_str(), item.spark_stage.as_ref().map(SparkStage::as_str), item.space.as_str(), tags_json(&item.tags)?, bool_i64(item.archived), item.created_at, item.updated_at, item.device_id, item.workspace_id],
        )?;
        self.refresh_search(SearchDocument {
            id: &item.id,
            kind: "inbox",
            title: &item.title,
            body: &item.body,
            tags: &item.tags,
            space: &item.space,
            updated_at: &item.updated_at,
            archived: item.archived,
        })
    }

    pub fn get_inbox(&self, id: &str) -> AppResult<InboxItem> {
        self.conn.query_row("SELECT id,title,body,kind,spark_stage,space,tags,archived,created_at,updated_at,device_id,workspace_id FROM inbox WHERE id=?1", [id], inbox_from_row).optional()?.ok_or_else(|| AppError::NotFound(format!("收件箱内容 {id}")))
    }

    pub fn list_inbox(&self, space: &Space, include_archived: bool) -> AppResult<Vec<InboxItem>> {
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare("SELECT id,title,body,kind,spark_stage,space,tags,archived,created_at,updated_at,device_id,workspace_id FROM inbox WHERE (?1 OR archived=0) ORDER BY created_at DESC")?;
            for row in statement.query_map([bool_i64(include_archived)], inbox_from_row)? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare("SELECT id,title,body,kind,spark_stage,space,tags,archived,created_at,updated_at,device_id,workspace_id FROM inbox WHERE space=?1 AND (?2 OR archived=0) ORDER BY created_at DESC")?;
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                inbox_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_event(&self, event: &ScheduleEvent) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO events (id,title,date,start_time,end_time,all_day,notes,task_id,project_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,date=excluded.date,start_time=excluded.start_time,end_time=excluded.end_time,all_day=excluded.all_day,notes=excluded.notes,task_id=excluded.task_id,project_id=excluded.project_id,space=excluded.space,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![event.id, event.title, event.date, event.start_time, event.end_time, bool_i64(event.all_day), event.notes, event.task_id, event.project_id, event.space.as_str(), tags_json(&event.tags)?, bool_i64(event.favorite), bool_i64(event.archived), event.created_at, event.updated_at, event.device_id, event.workspace_id, event.revision],
        )?;
        self.refresh_search(SearchDocument {
            id: &event.id,
            kind: "event",
            title: &event.title,
            body: &event.notes,
            tags: &event.tags,
            space: &event.space,
            updated_at: &event.updated_at,
            archived: event.archived,
        })
    }

    pub fn get_event(&self, id: &str) -> AppResult<ScheduleEvent> {
        self.conn
            .query_row(
                "SELECT id,title,date,start_time,end_time,all_day,notes,task_id,project_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM events WHERE id=?1",
                [id],
                event_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("日程 {id}")))
    }

    pub fn list_events(
        &self,
        space: &Space,
        start_date: Option<&str>,
        end_date: Option<&str>,
        include_archived: bool,
    ) -> AppResult<Vec<ScheduleEvent>> {
        let mut result = Vec::new();
        let query = "SELECT id,title,date,start_time,end_time,all_day,notes,task_id,project_id,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM events WHERE (?1 OR archived=0) AND (?2 IS NULL OR date>=?2) AND (?3 IS NULL OR date<=?3) AND (?4 IS NULL OR space=?4) ORDER BY date, all_day DESC, start_time IS NULL, start_time, updated_at DESC";
        let space_filter = (space != &Space::All).then_some(space.as_str());
        let mut statement = self.conn.prepare(query)?;
        for row in statement.query_map(
            params![
                bool_i64(include_archived),
                start_date,
                end_date,
                space_filter
            ],
            event_from_row,
        )? {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn upsert_checklist(&self, checklist: &Checklist) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO checklists (id,title,description,items,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,items=excluded.items,space=excluded.space,tags=excluded.tags,favorite=excluded.favorite,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![checklist.id, checklist.title, checklist.description, serde_json::to_string(&checklist.items)?, checklist.space.as_str(), tags_json(&checklist.tags)?, bool_i64(checklist.favorite), bool_i64(checklist.archived), checklist.created_at, checklist.updated_at, checklist.device_id, checklist.workspace_id, checklist.revision],
        )?;
        let body = checklist
            .items
            .iter()
            .map(|item| item.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        self.refresh_search(SearchDocument {
            id: &checklist.id,
            kind: "checklist",
            title: &checklist.title,
            body: &format!("{} {body}", checklist.description),
            tags: &checklist.tags,
            space: &checklist.space,
            updated_at: &checklist.updated_at,
            archived: checklist.archived,
        })
    }

    pub fn get_checklist(&self, id: &str) -> AppResult<Checklist> {
        self.conn
            .query_row(
                "SELECT id,title,description,items,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM checklists WHERE id=?1",
                [id],
                checklist_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("清单 {id}")))
    }

    pub fn list_checklists(
        &self,
        space: &Space,
        include_archived: bool,
    ) -> AppResult<Vec<Checklist>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,title,description,items,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM checklists WHERE (?1 OR archived=0) ORDER BY updated_at DESC"
        } else {
            "SELECT id,title,description,items,space,tags,favorite,archived,created_at,updated_at,device_id,workspace_id,revision FROM checklists WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([bool_i64(include_archived)], checklist_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                checklist_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_template(&self, template: &Template) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO templates (id,name,description,kind,payload,space,archived,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,kind=excluded.kind,payload=excluded.payload,space=excluded.space,archived=excluded.archived,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![template.id, template.name, template.description, template.kind.as_str(), serde_json::to_string(&template.payload)?, template.space.as_str(), bool_i64(template.archived), template.created_at, template.updated_at, template.device_id, template.workspace_id, template.revision],
        )?;
        Ok(())
    }

    pub fn get_template(&self, id: &str) -> AppResult<Template> {
        self.conn
            .query_row(
                "SELECT id,name,description,kind,payload,space,archived,created_at,updated_at,device_id,workspace_id,revision FROM templates WHERE id=?1",
                [id],
                template_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("模板 {id}")))
    }

    pub fn list_templates(
        &self,
        space: &Space,
        include_archived: bool,
    ) -> AppResult<Vec<Template>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,name,description,kind,payload,space,archived,created_at,updated_at,device_id,workspace_id,revision FROM templates WHERE (?1 OR archived=0) ORDER BY updated_at DESC"
        } else {
            "SELECT id,name,description,kind,payload,space,archived,created_at,updated_at,device_id,workspace_id,revision FROM templates WHERE space=?1 AND (?2 OR archived=0) ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([bool_i64(include_archived)], template_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map(
                params![space.as_str(), bool_i64(include_archived)],
                template_from_row,
            )? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn upsert_wiki_links(
        &self,
        source_id: &str,
        source_kind: &str,
        source_title: &str,
        space: &Space,
        target_titles: &[String],
    ) -> AppResult<()> {
        self.conn.execute(
            "DELETE FROM wiki_links WHERE source_id=?1 AND source_kind=?2",
            params![source_id, source_kind],
        )?;
        for (index, target_title) in target_titles.iter().enumerate() {
            let mut statement = self.conn.prepare(
                "SELECT id, 'note' AS kind FROM notes WHERE title=?1 AND space=?2 AND archived=0
                 UNION ALL
                 SELECT id, 'knowledge_page' AS kind FROM knowledge_pages WHERE title=?1 AND space=?2 AND archived=0",
            )?;
            let matches = statement
                .query_map(params![target_title, space.as_str()], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let (target_id, target_kind) = if matches.len() == 1 {
                (Some(matches[0].0.clone()), Some(matches[0].1.clone()))
            } else {
                (None, None)
            };
            self.conn.execute(
                "INSERT INTO wiki_links (id,source_id,source_kind,source_title,target_title,target_id,target_kind,space,resolved)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    format!("{source_kind}:{source_id}:{index}"),
                    source_id,
                    source_kind,
                    source_title,
                    target_title,
                    target_id,
                    target_kind,
                    space.as_str(),
                    bool_i64(matches.len() == 1)
                ],
            )?;
        }
        Ok(())
    }

    pub fn list_wiki_links(&self, source_id: &str, source_kind: &str) -> AppResult<Vec<WikiLink>> {
        let mut result = Vec::new();
        let mut statement = self.conn.prepare(
            "SELECT id,source_id,source_kind,source_title,target_title,target_id,target_kind,space,resolved
             FROM wiki_links WHERE source_id=?1 AND source_kind=?2 ORDER BY target_title",
        )?;
        for row in statement.query_map(params![source_id, source_kind], wiki_link_from_row)? {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn list_wiki_backlinks(
        &self,
        target_id: &str,
        target_kind: &str,
    ) -> AppResult<Vec<WikiLink>> {
        let mut result = Vec::new();
        let mut statement = self.conn.prepare(
            "SELECT id,source_id,source_kind,source_title,target_title,target_id,target_kind,space,resolved
             FROM wiki_links WHERE target_id=?1 AND target_kind=?2 ORDER BY source_title",
        )?;
        for row in statement.query_map(params![target_id, target_kind], wiki_link_from_row)? {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn upsert_version(&self, version: &DocumentVersion) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO document_versions (id,entity_id,entity_kind,title,content,snapshot,space,created_at,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO UPDATE SET entity_id=excluded.entity_id,entity_kind=excluded.entity_kind,title=excluded.title,content=excluded.content,snapshot=excluded.snapshot,space=excluded.space,created_at=excluded.created_at,revision=excluded.revision",
            params![
                version.id,
                version.entity_id,
                version.entity_kind.as_str(),
                version.title,
                version.content,
                serde_json::to_string(&version.snapshot)?,
                version.space.as_str(),
                version.created_at,
                version.revision
            ],
        )?;
        Ok(())
    }

    pub fn list_versions(
        &self,
        entity_id: &str,
        entity_kind: &DocumentKind,
    ) -> AppResult<Vec<DocumentVersion>> {
        let mut result = Vec::new();
        let mut statement = self.conn.prepare(
            "SELECT id,entity_id,entity_kind,title,content,snapshot,space,created_at,revision
             FROM document_versions WHERE entity_id=?1 AND entity_kind=?2 ORDER BY created_at DESC",
        )?;
        for row in statement.query_map(
            params![entity_id, entity_kind.as_str()],
            document_version_from_row,
        )? {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_version(&self, id: &str) -> AppResult<DocumentVersion> {
        self.conn
            .query_row(
                "SELECT id,entity_id,entity_kind,title,content,snapshot,space,created_at,revision FROM document_versions WHERE id=?1",
                [id],
                document_version_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("历史版本 {id}")))
    }

    pub fn upsert_trash_item(
        &self,
        item: &TrashItem,
        payload: &serde_json::Value,
    ) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO trash_items (id,entity_id,kind,title,space,original_folder,deleted_at,purge_at,payload)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO UPDATE SET entity_id=excluded.entity_id,kind=excluded.kind,title=excluded.title,space=excluded.space,original_folder=excluded.original_folder,deleted_at=excluded.deleted_at,purge_at=excluded.purge_at,payload=excluded.payload",
            params![
                item.id,
                item.entity_id,
                item.kind,
                item.title,
                item.space.as_str(),
                item.original_folder,
                item.deleted_at,
                item.purge_at,
                serde_json::to_string(payload)?
            ],
        )?;
        Ok(())
    }

    pub fn get_trash_record(&self, id: &str) -> AppResult<(TrashItem, serde_json::Value)> {
        self.conn
            .query_row(
                "SELECT id,entity_id,kind,title,space,original_folder,deleted_at,purge_at,payload FROM trash_items WHERE id=?1",
                [id],
                |row| {
                    let item = trash_item_from_row(row)?;
                    let payload: serde_json::Value = serde_json::from_str(&text(row, 8)?)
                        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
                    Ok((item, payload))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("回收站内容 {id}")))
    }

    pub fn list_trash(&self, space: &Space) -> AppResult<Vec<TrashItem>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,entity_id,kind,title,space,original_folder,deleted_at,purge_at FROM trash_items ORDER BY deleted_at DESC"
        } else {
            "SELECT id,entity_id,kind,title,space,original_folder,deleted_at,purge_at FROM trash_items WHERE space=?1 ORDER BY deleted_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([], trash_item_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map([space.as_str()], trash_item_from_row)? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn delete_trash_item(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM trash_items WHERE id=?1", [id])?;
        Ok(())
    }

    pub fn delete_note(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("notes", id)
    }
    pub fn delete_task(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("tasks", id)
    }
    pub fn delete_project(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("projects", id)
    }
    pub fn delete_inbox(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("inbox", id)
    }
    pub fn delete_event(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("events", id)
    }
    pub fn delete_checklist(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("checklists", id)
    }
    pub fn delete_template(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("templates", id)
    }
    pub fn delete_knowledge_folder(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("knowledge_folders", id)
    }
    pub fn delete_knowledge_page(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("knowledge_pages", id)
    }

    pub fn upsert_pdf_document(&self, document: &PdfDocument) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO documents (id,title,file_name,relative_path,space,size,sha256,page_count,extracted_text,ocr_status,created_at,updated_at,device_id,workspace_id,revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title,file_name=excluded.file_name,relative_path=excluded.relative_path,space=excluded.space,size=excluded.size,sha256=excluded.sha256,page_count=excluded.page_count,extracted_text=excluded.extracted_text,ocr_status=excluded.ocr_status,created_at=excluded.created_at,updated_at=excluded.updated_at,device_id=excluded.device_id,workspace_id=excluded.workspace_id,revision=excluded.revision",
            params![
                document.id,
                document.title,
                document.file_name,
                document.relative_path,
                document.space.as_str(),
                document.size as i64,
                document.sha256,
                document.page_count,
                document.extracted_text,
                document.ocr_status.as_str(),
                document.created_at,
                document.updated_at,
                document.device_id,
                document.workspace_id,
                document.revision
            ],
        )?;
        self.refresh_search(SearchDocument {
            id: &document.id,
            kind: "pdf",
            title: &document.title,
            body: &document.extracted_text,
            tags: &[],
            space: &document.space,
            updated_at: &document.updated_at,
            archived: false,
        })
    }

    pub fn get_pdf_document(&self, id: &str) -> AppResult<PdfDocument> {
        self.conn
            .query_row(
                "SELECT id,title,file_name,relative_path,space,size,sha256,page_count,extracted_text,ocr_status,created_at,updated_at,device_id,workspace_id,revision FROM documents WHERE id=?1",
                [id],
                pdf_document_from_row,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("PDF 文档 {id}")))
    }

    pub fn list_pdf_documents(&self, space: &Space) -> AppResult<Vec<PdfDocument>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,title,file_name,relative_path,space,size,sha256,page_count,extracted_text,ocr_status,created_at,updated_at,device_id,workspace_id,revision FROM documents ORDER BY updated_at DESC"
        } else {
            "SELECT id,title,file_name,relative_path,space,size,sha256,page_count,extracted_text,ocr_status,created_at,updated_at,device_id,workspace_id,revision FROM documents WHERE space=?1 ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([], pdf_document_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map([space.as_str()], pdf_document_from_row)? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn delete_pdf_document(&self, id: &str) -> AppResult<()> {
        self.delete_content_row("documents", id)
    }

    pub fn upsert_semantic_document(&self, document: &SemanticDocumentRecord) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO semantic_documents (id,kind,title,content,space,vector,updated_at,tags)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,content=excluded.content,space=excluded.space,vector=excluded.vector,updated_at=excluded.updated_at,tags=excluded.tags",
            params![
                document.id,
                document.kind,
                document.title,
                document.content,
                document.space.as_str(),
                serde_json::to_string(&document.vector)?,
                document.updated_at,
                tags_json(&document.tags)?
            ],
        )?;
        Ok(())
    }

    pub fn list_semantic_documents(&self, space: &Space) -> AppResult<Vec<SemanticDocumentRecord>> {
        let mut result = Vec::new();
        let query = if space == &Space::All {
            "SELECT id,kind,title,content,space,vector,updated_at,tags FROM semantic_documents ORDER BY updated_at DESC"
        } else {
            "SELECT id,kind,title,content,space,vector,updated_at,tags FROM semantic_documents WHERE space=?1 ORDER BY updated_at DESC"
        };
        let mut statement = self.conn.prepare(query)?;
        if space == &Space::All {
            for row in statement.query_map([], semantic_document_from_row)? {
                result.push(row?);
            }
        } else {
            for row in statement.query_map([space.as_str()], semantic_document_from_row)? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn delete_semantic_document(&self, id: &str) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM semantic_documents WHERE id=?1", [id])?;
        Ok(())
    }

    pub fn add_attachment(
        &self,
        id: &str,
        file_name: &str,
        path: &str,
        entity_id: Option<&str>,
        space: &Space,
        created_at: &str,
    ) -> AppResult<()> {
        self.conn.execute("INSERT INTO attachments (id,file_name,path,entity_id,space,created_at) VALUES (?1,?2,?3,?4,?5,?6)", params![id, file_name, path, entity_id, space.as_str(), created_at])?;
        Ok(())
    }

    pub fn search(&self, query: &str, space: &Space) -> AppResult<Vec<SearchResult>> {
        let terms: Vec<String> = query
            .split_whitespace()
            .map(|term| term.replace('"', ""))
            .filter(|term| !term.is_empty())
            .map(|term| format!("\"{term}\"*"))
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let match_query = terms.join(" OR ");
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare("SELECT id,kind,title,snippet(search_index, 3, '<mark>', '</mark>', '…', 18),space,updated_at,tags FROM search_index WHERE search_index MATCH ?1 ORDER BY rank LIMIT 40")?;
            for row in statement.query_map([match_query], search_from_row)? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare("SELECT id,kind,title,snippet(search_index, 3, '<mark>', '</mark>', '…', 18),space,updated_at,tags FROM search_index WHERE search_index MATCH ?1 AND space=?2 ORDER BY rank LIMIT 40")?;
            for row in statement.query_map(params![match_query, space.as_str()], search_from_row)? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    pub fn list_tags(&self, space: &Space) -> AppResult<Vec<TagSummary>> {
        let mut counts = BTreeMap::<String, i64>::new();
        for tags in self.collect_tag_json("notes", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("tasks", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("bugs", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("projects", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("inbox", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("events", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        for tags in self.collect_tag_json("checklists", "tags", space)? {
            add_tags(&mut counts, &tags);
        }
        Ok(counts
            .into_iter()
            .map(|(name, count)| TagSummary { name, count })
            .collect())
    }

    fn collect_tag_json(&self, table: &str, column: &str, space: &Space) -> AppResult<Vec<String>> {
        let sql_all = format!("SELECT {column} FROM {table}");
        let sql_space = format!("SELECT {column} FROM {table} WHERE space=?1");
        let mut result = Vec::new();
        if space == &Space::All {
            let mut statement = self.conn.prepare(&sql_all)?;
            for row in statement.query_map([], |row| row.get::<_, String>(0))? {
                result.push(row?);
            }
        } else {
            let mut statement = self.conn.prepare(&sql_space)?;
            for row in statement.query_map([space.as_str()], |row| row.get::<_, String>(0))? {
                result.push(row?);
            }
        }
        Ok(result)
    }

    fn delete_content_row(&self, table: &str, id: &str) -> AppResult<()> {
        let query = format!("DELETE FROM {table} WHERE id=?1");
        self.conn.execute(&query, [id])?;
        self.conn
            .execute("DELETE FROM search_index WHERE id=?1", [id])?;
        self.conn
            .execute("DELETE FROM semantic_documents WHERE id=?1", [id])?;
        self.conn.execute(
            "DELETE FROM wiki_links WHERE source_id=?1 OR target_id=?1",
            [id],
        )?;
        Ok(())
    }

    fn refresh_search(&self, document: SearchDocument<'_>) -> AppResult<()> {
        self.conn
            .execute("DELETE FROM search_index WHERE id=?1", [document.id])?;
        if document.archived {
            return Ok(());
        }
        self.conn.execute("INSERT INTO search_index (id,kind,title,body,tags,space,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)", params![document.id, document.kind, document.title, document.body, document.tags.join(" "), document.space.as_str(), document.updated_at])?;
        Ok(())
    }
}

fn bool_i64(value: bool) -> i64 {
    i64::from(value)
}
fn tags_json(tags: &[String]) -> AppResult<String> {
    Ok(serde_json::to_string(tags)?)
}
fn parse_tags(value: String) -> Vec<String> {
    serde_json::from_str(&value).unwrap_or_default()
}

fn ocr_status(value: String) -> PdfOcrStatus {
    match value.as_str() {
        "pending" => PdfOcrStatus::Pending,
        "completed" => PdfOcrStatus::Completed,
        "failed" => PdfOcrStatus::Failed,
        _ => PdfOcrStatus::NotRun,
    }
}

fn pdf_document_from_row(row: &Row<'_>) -> rusqlite::Result<PdfDocument> {
    Ok(PdfDocument {
        id: text(row, 0)?,
        title: text(row, 1)?,
        file_name: text(row, 2)?,
        relative_path: text(row, 3)?,
        space: space(text(row, 4)?)?,
        size: row.get::<_, i64>(5)? as u64,
        sha256: text(row, 6)?,
        page_count: row.get(7)?,
        extracted_text: text(row, 8)?,
        ocr_status: ocr_status(text(row, 9)?),
        created_at: text(row, 10)?,
        updated_at: text(row, 11)?,
        device_id: text(row, 12)?,
        workspace_id: text(row, 13)?,
        revision: row.get(14)?,
    })
}

fn semantic_document_from_row(row: &Row<'_>) -> rusqlite::Result<SemanticDocumentRecord> {
    Ok(SemanticDocumentRecord {
        id: text(row, 0)?,
        kind: text(row, 1)?,
        title: text(row, 2)?,
        content: text(row, 3)?,
        space: space(text(row, 4)?)?,
        vector: serde_json::from_str(&text(row, 5)?).unwrap_or_default(),
        updated_at: text(row, 6)?,
        tags: parse_tags(text(row, 7)?),
    })
}
fn add_tags(counts: &mut BTreeMap<String, i64>, value: &str) {
    for tag in parse_tags(value.to_string()) {
        *counts.entry(tag).or_default() += 1;
    }
}
fn text(row: &Row<'_>, index: usize) -> rusqlite::Result<String> {
    row.get(index)
}
fn optional_text(row: &Row<'_>, index: usize) -> rusqlite::Result<Option<String>> {
    row.get(index)
}
fn space(value: String) -> rusqlite::Result<Space> {
    Ok(match value.as_str() {
        "personal" => Space::Personal,
        "work" => Space::Work,
        _ => Space::All,
    })
}
fn task_status(value: String) -> TaskStatus {
    match value.as_str() {
        "in_progress" => TaskStatus::InProgress,
        "waiting" => TaskStatus::Waiting,
        "done" => TaskStatus::Done,
        "cancelled" => TaskStatus::Cancelled,
        _ => TaskStatus::Todo,
    }
}
fn task_priority(value: String) -> TaskPriority {
    match value.as_str() {
        "urgent" => TaskPriority::Urgent,
        "high" => TaskPriority::High,
        "low" => TaskPriority::Low,
        _ => TaskPriority::Normal,
    }
}
fn project_status(value: String) -> ProjectStatus {
    match value.as_str() {
        "active" => ProjectStatus::Active,
        "paused" => ProjectStatus::Paused,
        "completed" => ProjectStatus::Completed,
        "archived" => ProjectStatus::Archived,
        _ => ProjectStatus::Planning,
    }
}
fn inbox_kind(value: String) -> InboxKind {
    match value.as_str() {
        "task" => InboxKind::Task,
        "memo" => InboxKind::Memo,
        "checklist" => InboxKind::Checklist,
        "spark" => InboxKind::Spark,
        _ => InboxKind::Note,
    }
}
fn spark_stage(value: Option<String>) -> Option<SparkStage> {
    match value.as_deref() {
        Some("new") => Some(SparkStage::New),
        Some("developing") => Some(SparkStage::Developing),
        Some("converted") => Some(SparkStage::Converted),
        _ => None,
    }
}
fn bool_value(value: i64) -> bool {
    value != 0
}

fn note_from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: text(row, 0)?,
        title: text(row, 1)?,
        content: text(row, 2)?,
        space: space(text(row, 3)?)?,
        project_id: optional_text(row, 4)?,
        tags: parse_tags(text(row, 5)?),
        favorite: bool_value(row.get(6)?),
        archived: bool_value(row.get(7)?),
        created_at: text(row, 8)?,
        updated_at: text(row, 9)?,
        device_id: text(row, 10)?,
        workspace_id: text(row, 11)?,
        revision: row.get(12)?,
    })
}
fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: text(row, 0)?,
        title: text(row, 1)?,
        description: text(row, 2)?,
        status: task_status(text(row, 3)?),
        priority: task_priority(text(row, 4)?),
        due_date: optional_text(row, 5)?,
        space: space(text(row, 6)?)?,
        project_id: optional_text(row, 7)?,
        tags: parse_tags(text(row, 8)?),
        parent_id: optional_text(row, 9)?,
        favorite: bool_value(row.get(10)?),
        archived: bool_value(row.get(11)?),
        created_at: text(row, 12)?,
        updated_at: text(row, 13)?,
        device_id: text(row, 14)?,
        workspace_id: text(row, 15)?,
        revision: row.get(16)?,
    })
}
fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: text(row, 0)?,
        name: text(row, 1)?,
        description: text(row, 2)?,
        status: project_status(text(row, 3)?),
        progress: row.get(4)?,
        space: space(text(row, 5)?)?,
        tags: parse_tags(text(row, 6)?),
        favorite: bool_value(row.get(7)?),
        archived: bool_value(row.get(8)?),
        created_at: text(row, 9)?,
        updated_at: text(row, 10)?,
        device_id: text(row, 11)?,
        workspace_id: text(row, 12)?,
        revision: row.get(13)?,
    })
}
fn inbox_from_row(row: &Row<'_>) -> rusqlite::Result<InboxItem> {
    Ok(InboxItem {
        id: text(row, 0)?,
        title: text(row, 1)?,
        body: text(row, 2)?,
        kind: inbox_kind(text(row, 3)?),
        spark_stage: spark_stage(row.get(4)?),
        space: space(text(row, 5)?)?,
        tags: parse_tags(text(row, 6)?),
        archived: bool_value(row.get(7)?),
        created_at: text(row, 8)?,
        updated_at: text(row, 9)?,
        device_id: text(row, 10)?,
        workspace_id: text(row, 11)?,
    })
}
fn knowledge_folder_from_row(row: &Row<'_>) -> rusqlite::Result<KnowledgeFolder> {
    Ok(KnowledgeFolder {
        id: text(row, 0)?,
        name: text(row, 1)?,
        parent_id: optional_text(row, 2)?,
        space: space(text(row, 3)?)?,
        position: row.get(4)?,
        archived: bool_value(row.get(5)?),
        created_at: text(row, 6)?,
        updated_at: text(row, 7)?,
        device_id: text(row, 8)?,
        workspace_id: text(row, 9)?,
        revision: row.get(10)?,
    })
}
fn knowledge_page_from_row(row: &Row<'_>) -> rusqlite::Result<KnowledgePage> {
    Ok(KnowledgePage {
        id: text(row, 0)?,
        title: text(row, 1)?,
        content: text(row, 2)?,
        parent_id: optional_text(row, 3)?,
        space: space(text(row, 4)?)?,
        tags: parse_tags(text(row, 5)?),
        favorite: bool_value(row.get(6)?),
        archived: bool_value(row.get(7)?),
        created_at: text(row, 8)?,
        updated_at: text(row, 9)?,
        device_id: text(row, 10)?,
        workspace_id: text(row, 11)?,
        revision: row.get(12)?,
    })
}
fn event_from_row(row: &Row<'_>) -> rusqlite::Result<ScheduleEvent> {
    Ok(ScheduleEvent {
        id: text(row, 0)?,
        title: text(row, 1)?,
        date: text(row, 2)?,
        start_time: optional_text(row, 3)?,
        end_time: optional_text(row, 4)?,
        all_day: bool_value(row.get(5)?),
        notes: text(row, 6)?,
        task_id: optional_text(row, 7)?,
        project_id: optional_text(row, 8)?,
        space: space(text(row, 9)?)?,
        tags: parse_tags(text(row, 10)?),
        favorite: bool_value(row.get(11)?),
        archived: bool_value(row.get(12)?),
        created_at: text(row, 13)?,
        updated_at: text(row, 14)?,
        device_id: text(row, 15)?,
        workspace_id: text(row, 16)?,
        revision: row.get(17)?,
    })
}
fn checklist_from_row(row: &Row<'_>) -> rusqlite::Result<Checklist> {
    Ok(Checklist {
        id: text(row, 0)?,
        title: text(row, 1)?,
        description: text(row, 2)?,
        items: serde_json::from_str(&text(row, 3)?).unwrap_or_default(),
        space: space(text(row, 4)?)?,
        tags: parse_tags(text(row, 5)?),
        favorite: bool_value(row.get(6)?),
        archived: bool_value(row.get(7)?),
        created_at: text(row, 8)?,
        updated_at: text(row, 9)?,
        device_id: text(row, 10)?,
        workspace_id: text(row, 11)?,
        revision: row.get(12)?,
    })
}
fn template_kind(value: String) -> TemplateKind {
    match value.as_str() {
        "task" => TemplateKind::Task,
        "project" => TemplateKind::Project,
        "checklist" => TemplateKind::Checklist,
        _ => TemplateKind::Note,
    }
}
fn template_from_row(row: &Row<'_>) -> rusqlite::Result<Template> {
    Ok(Template {
        id: text(row, 0)?,
        name: text(row, 1)?,
        description: text(row, 2)?,
        kind: template_kind(text(row, 3)?),
        payload: serde_json::from_str(&text(row, 4)?).unwrap_or(serde_json::Value::Null),
        space: space(text(row, 5)?)?,
        archived: bool_value(row.get(6)?),
        created_at: text(row, 7)?,
        updated_at: text(row, 8)?,
        device_id: text(row, 9)?,
        workspace_id: text(row, 10)?,
        revision: row.get(11)?,
    })
}
fn document_kind(value: String) -> DocumentKind {
    match value.as_str() {
        "knowledge_page" => DocumentKind::KnowledgePage,
        _ => DocumentKind::Note,
    }
}
fn document_version_from_row(row: &Row<'_>) -> rusqlite::Result<DocumentVersion> {
    Ok(DocumentVersion {
        id: text(row, 0)?,
        entity_id: text(row, 1)?,
        entity_kind: document_kind(text(row, 2)?),
        title: text(row, 3)?,
        content: text(row, 4)?,
        snapshot: serde_json::from_str(&text(row, 5)?).unwrap_or(serde_json::Value::Null),
        space: space(text(row, 6)?)?,
        created_at: text(row, 7)?,
        revision: row.get(8)?,
    })
}
fn wiki_link_from_row(row: &Row<'_>) -> rusqlite::Result<WikiLink> {
    Ok(WikiLink {
        id: text(row, 0)?,
        source_id: text(row, 1)?,
        source_kind: text(row, 2)?,
        source_title: text(row, 3)?,
        target_title: text(row, 4)?,
        target_id: optional_text(row, 5)?,
        target_kind: optional_text(row, 6)?,
        space: space(text(row, 7)?)?,
        resolved: bool_value(row.get(8)?),
    })
}
fn trash_item_from_row(row: &Row<'_>) -> rusqlite::Result<TrashItem> {
    Ok(TrashItem {
        id: text(row, 0)?,
        entity_id: text(row, 1)?,
        kind: text(row, 2)?,
        title: text(row, 3)?,
        space: space(text(row, 4)?)?,
        original_folder: text(row, 5)?,
        deleted_at: text(row, 6)?,
        purge_at: text(row, 7)?,
    })
}
fn search_from_row(row: &Row<'_>) -> rusqlite::Result<SearchResult> {
    Ok(SearchResult {
        id: text(row, 0)?,
        kind: text(row, 1)?,
        title: text(row, 2)?,
        snippet: text(row, 3)?,
        space: space(text(row, 4)?)?,
        updated_at: text(row, 5)?,
        tags: parse_tags(text(row, 6)?),
        score: 0.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ChecklistItem;
    use tempfile::tempdir;

    #[test]
    fn creates_and_searches_an_indexed_note() {
        let directory = tempdir().unwrap();
        let database = Database::open(&directory.path().join("test.db")).unwrap();
        let note = Note {
            id: "note-1".into(),
            title: "VPN 调试".into(),
            content: "检查 timeout 和网络延迟".into(),
            space: Space::Work,
            project_id: None,
            tags: vec!["Android".into()],
            favorite: false,
            archived: false,
            created_at: "2026-09-15T00:00:00Z".into(),
            updated_at: "2026-09-15T00:00:00Z".into(),
            device_id: "device".into(),
            workspace_id: "workspace".into(),
            revision: 1,
        };
        database.upsert_note(&note).unwrap();
        let found = database.search("timeout", &Space::All).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "note-1");

        let mut archived = note;
        archived.archived = true;
        database.upsert_note(&archived).unwrap();
        assert!(database.search("timeout", &Space::All).unwrap().is_empty());
    }

    #[test]
    fn filters_and_indexes_schedule_events_and_checklists() {
        let directory = tempdir().unwrap();
        let database = Database::open(&directory.path().join("test.db")).unwrap();
        let event = ScheduleEvent {
            id: "event-1".into(),
            title: "Release review".into(),
            date: "2026-09-16".into(),
            start_time: Some("09:00".into()),
            end_time: Some("10:00".into()),
            all_day: false,
            notes: "Review the release calendar".into(),
            task_id: None,
            project_id: None,
            space: Space::Work,
            tags: vec!["release".into()],
            favorite: false,
            archived: false,
            created_at: "2026-09-15T00:00:00Z".into(),
            updated_at: "2026-09-15T00:00:00Z".into(),
            device_id: "device".into(),
            workspace_id: "workspace".into(),
            revision: 1,
        };
        let checklist = Checklist {
            id: "checklist-1".into(),
            title: "Release checklist".into(),
            description: "Before shipping".into(),
            items: vec![ChecklistItem {
                id: "item-1".into(),
                text: "Run tests".into(),
                completed: false,
                position: 0,
            }],
            space: Space::Work,
            tags: vec!["release".into()],
            favorite: false,
            archived: false,
            created_at: "2026-09-15T00:00:00Z".into(),
            updated_at: "2026-09-15T00:00:00Z".into(),
            device_id: "device".into(),
            workspace_id: "workspace".into(),
            revision: 1,
        };

        database.upsert_event(&event).unwrap();
        database.upsert_checklist(&checklist).unwrap();

        let events = database
            .list_events(&Space::Work, Some("2026-09-16"), Some("2026-09-16"), false)
            .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "event-1");
        assert_eq!(
            database.search("calendar", &Space::Work).unwrap()[0].kind,
            "event"
        );
        assert_eq!(
            database.search("checklist", &Space::Work).unwrap()[0].kind,
            "checklist"
        );

        let mut archived_event = event;
        archived_event.archived = true;
        database.upsert_event(&archived_event).unwrap();
        assert!(database
            .search("calendar", &Space::Work)
            .unwrap()
            .is_empty());
        assert_eq!(
            database
                .list_events(&Space::Work, None, None, false)
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            database
                .list_events(&Space::Work, None, None, true)
                .unwrap()
                .len(),
            1
        );
    }
}
