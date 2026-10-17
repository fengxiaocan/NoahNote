# BUG Task List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a first-class BUG task workspace in NoahNote with date-aware status tracking, searchable local storage, reliable newline-separated import, and Markdown export.

**Architecture:** Store each BUG and its activity log as one space-scoped JSON entity. Add a rebuildable SQLite index and Tauri commands; keep state/date rules, import preview, and Markdown generation on the Rust side. Build a React BUG page on existing NoahNote controls and connect the shared search, Today, project, archive, trash, backup, and restore flows.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, serde, SQLite, and the repository's existing JSON workspace, dialog, and design-system infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-16-bug-task-list-design.md`

## Global Constraints

- Use the local-first workspace and existing personal / work isolation.
- Keep BUG status, priority, severity, and date rules separate from normal Task.
- Store BUG dates as validated `YYYY-MM-DD` calendar dates and created / updated / activity times as UTC timestamps.
- Title is required and capped at 300 Unicode characters; description at 100,000; notes at 20,000; environment at 2,000.
- A text import may contain at most 2 MiB and 2,000 valid rows; create rows in batches of at most 50.
- Persist BUG content and activity together in JSON; rebuild the SQLite index from those files after restore.
- Use one stable import `batchId` and row ID to make retries idempotent, including after an item has entered trash.
- Do not add a JS dependency. Use existing Tauri dialogs, shared controls, semantic tokens, and file APIs.
- Keep business rules in the shared Rust repository/domain path so UI, batch commands, and imports cannot bypass validation.
- Preserve the existing task, search, project-progress, backup, restore, and sync behaviors.
- Cover changed pure logic with meaningful Vitest / Rust tests; run the production TypeScript build and full Rust test suite before completion.

---

### Task 1: Shared BUG types and list behavior

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/bugs.ts`
- Create: `src/lib/bugs.test.ts`

**Interfaces:**
- `BugStatus` is `"todo" | "in_progress" | "blocked" | "pending_verification" | "deferred" | "done" | "cancelled"`.
- `BugPriority` is `"p0" | "p1" | "p2" | "p3"`; `BugSeverity` is `"s0" | "s1" | "s2" | "s3"`.
- `Bug`, `BugActivity`, `BugResolution`, `BugSource`, `BugDraft`, `BugStatusChange`, `BugQuery`, `BugStats`, `BugPage<T>`, and `BugRowResult` follow the schema in section 11.2 of the spec and use camelCase fields at the TypeScript boundary.
- `isBugOverdue(bug: Pick<Bug, "status" | "dueDate">, today: string): boolean`.
- `calculateBugStats(bugs: Bug[], today: string): BugStats`.
- `filterAndSortBugs(bugs: Bug[], query: BugQuery, today: string): Bug[]` applies all user-visible filters and deterministic sorting.
- `bugStatusLabels`, `bugPriorityLabels`, and `bugSeverityLabels` provide the shared Chinese labels.

- [ ] **Step 1: Write behavior tests** in `src/lib/bugs.test.ts`.

```ts
it("excludes cancelled bugs from completion-rate denominator", () => {
  const stats = calculateBugStats([todoBug(), doneBug(), cancelledBug()], "2026-10-16");
  expect(stats.total).toBe(3);
  expect(stats.cancelled).toBe(1);
  expect(stats.completionRate).toBe(50);
});

it("treats today as due today and not overdue", () => {
  const bug = { ...todoBug(), dueDate: "2026-10-16" };
  expect(isBugOverdue(bug, "2026-10-16")).toBe(false);
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `npm test -- src/lib/bugs.test.ts`  
Expected: FAIL because `src/lib/bugs.ts` does not yet export the tested helpers.

- [ ] **Step 3: Define TypeScript types and pure helpers**

Implement the exact signatures above, date-only lexical comparisons for canonical ISO dates, cancelled-excluding completion rate, and a stable ID tie-breaker for sorting. Accept `today` as an argument so date-boundary logic does not depend on the computer running the test.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/lib/bugs.test.ts`  
Expected: PASS, including the added same-day, overdue, filter, and stable-sort cases.

### Task 2: Rust domain rules and safe BUG file writes

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/workspace/repository.rs`
- Create: `src-tauri/src/bugs.rs`

**Interfaces:**
- Serde types mirror the TypeScript BUG schema and use existing `Space`, device ID, workspace ID, revision, and application error conventions.
- `validate_bug(bug: &Bug, today: NaiveDate) -> AppResult<()>` validates title, enum / resolution consistency, references available to the repository, and all three dates.
- `transition_bug(current: &Bug, change: &BugStatusChange, now: &str, today: NaiveDate) -> AppResult<Bug>` owns status, completion date, reopen count, and activity changes.
- New BUG writes use `write_bug_json_atomic(path, bug)` and keep the prior file intact on a failed or interrupted replacement.

- [ ] **Step 1: Add failing Rust domain tests** to `src-tauri/src/bugs.rs` for the state/date contract.

```rust
#[test]
fn completing_sets_the_completion_date_and_transition_event() {
    let bug = bug_in_status("in_progress");
    let updated = transition_bug(&bug, &complete("2026-10-16"), TEST_NOW, test_date())
        .expect("valid completion");
    assert_eq!(updated.status, BugStatus::Done);
    assert_eq!(updated.completed_date.as_deref(), Some("2026-10-16"));
    assert!(updated.activities.iter().any(|event| event.kind == BugActivityKind::StatusChanged));
}
```

- [ ] **Step 2: Run focused Rust tests and confirm the expected failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bugs::tests`  
Expected: FAIL because the BUG domain module, model, and transition are not implemented.

- [ ] **Step 3: Implement model validation and transitions**

Validate Gregorian dates by parsing `YYYY-MM-DD`; require BUG date and title; reject future BUG dates; reject due dates before BUG date; require completion date for `done` and prohibit it for other statuses. Require a note for `blocked`, `deferred`, `cancelled`, and failed verification. Clearing a completed BUG date on reopen records the old value in its event and increments `reopenCount` once.

- [ ] **Step 4: Make publication of a BUG file recoverable**

Write a unique temporary file in the BUG directory, flush it, and publish using the repository's cross-platform replacement path. Preserve the old file or a recoverable backup until publication succeeds. Do not use the existing `write_atomic` sequence for BUG updates: that helper deletes the old file before renaming the replacement.

- [ ] **Step 5: Run focused Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bugs::tests`  
Expected: PASS for valid / invalid dates, state transitions, reopen history, cancellation reasons, and failed replacement preserving the prior JSON.

### Task 3: Rebuildable BUG index and repository lifecycle

**Files:**
- Modify: `src-tauri/src/storage/database.rs`
- Modify: `src-tauri/src/workspace/repository.rs`
- Modify: `src-tauri/src/workspace/mod.rs`
- Modify: `src-tauri/src/models.rs`

**Interfaces:**
- `WorkspaceRepository::list_bugs(&self, space: &Space, query: &BugQuery) -> AppResult<BugPage>`.
- `WorkspaceRepository::get_bug(&self, id: &str) -> AppResult<Bug>`.
- `WorkspaceRepository::create_bug(&mut self, input: BugDraft) -> AppResult<Bug>`.
- `WorkspaceRepository::update_bug(&mut self, bug: Bug, expected_revision: i64) -> AppResult<Bug>`.
- `WorkspaceRepository::change_bug_status(&mut self, id: &str, change: BugStatusChange) -> AppResult<Bug>`.
- `WorkspaceRepository::append_bug_comment(&mut self, id: &str, comment: BugComment) -> AppResult<Bug>`.
- `WorkspaceRepository::archive_bug`, `delete_bug`, and `move_bug_space` reuse existing workspace semantics and validate project / duplicate references.
- `Database::upsert_bug`, `get_bug`, `list_bugs`, `find_imported_bug`, and `remove_bug` keep JSON as the authoritative record and SQLite as the query index.

- [ ] **Step 1: Add failing repository tests** for creation, persistence, reindex, and revision conflicts.

```rust
#[test]
fn bug_file_survives_workspace_reopen_and_rebuilds_the_index() {
    let (root, mut repository) = temporary_repository();
    let created = repository.create_bug(valid_bug_draft("editor freezes")).unwrap();
    drop(repository);
    let reopened = WorkspaceRepository::open(root).unwrap();
    assert_eq!(reopened.get_bug(&created.id).unwrap().title, "editor freezes");
}
```

- [ ] **Step 2: Run the focused repository test and confirm the expected failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bug_file_survives_workspace_reopen`  
Expected: FAIL because the BUG repository methods and index do not exist.

- [ ] **Step 3: Add the index schema and CRUD**

Index all filter and sort fields, tags, the serialized payload, and nullable import batch / row IDs. Keep source row IDs unique per batch. Load and validate BUG data from JSON on repository startup; make an individual malformed BUG report a structured error naming its file while retaining the file for repair.

- [ ] **Step 4: Wire JSON, search text, tags, trash, and recovery**

Create `personal/bugs` and `work/bugs`; read both in `reindex_files`; include archived rows when rebuilding. On update increment `revision`, use `expected_revision`, update search text and tag counts, and keep every activity in the same BUG document. Move deletes from the ordinary index into the existing trash payload; restoration checks collisions before restoring the original file and ID.

- [ ] **Step 5: Add query and lifecycle regression tests**

Test space filtering, archived visibility, combined search / filters, tag indexing, expected-revision conflict, deletion, restoration, permanent deletion, duplicate-reference rejection, and stable import lookup after reopening the workspace.

- [ ] **Step 6: Run all targeted repository and domain tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bug_`  
Expected: PASS; normal task files and existing task repository tests remain unchanged.

### Task 4: Tauri and TypeScript API boundary

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/api.ts`
- Modify: `src/types.ts`
- Create: `src-tauri/src/bugs/import.rs`
- Create: `src-tauri/src/bugs/export.rs`

**Interfaces:**
- `preview_bug_import(input: BugImportPreviewInput) -> AppResult<BugImportPreview>` is non-mutating and returns the stable row IDs / errors used by commit.
- `import_bugs(input: BugImportCommitInput) -> AppResult<Vec<BugRowResult>>` validates again and writes in groups of at most 50 using source IDs as idempotency keys.
- `prepare_bug_export(input: BugExportInput) -> AppResult<BugExport>` makes one immutable content snapshot for preview and saving.
- `save_bug_export(path: String, markdown: String) -> AppResult<String>` saves UTF-8 to the path chosen by the user.
- `api.listBugs`, `getBug`, `createBug`, `updateBug`, `changeBugStatus`, `appendBugComment`, `batchUpdateBugs`, `previewBugImport`, `importBugs`, `prepareBugExport`, `archiveBug`, `deleteBug`, and `moveBugSpace` have camelCase arguments matching the Rust command input types.

- [ ] **Step 1: Write failing parser and renderer unit tests**

`import.rs` tests cover BOM, LF / CRLF / CR, blank-line source numbers, optional Markdown prefixes and checkboxes, duplicate input titles, invalid UTF-8 input boundaries, and caps. `export.rs` tests cover status / dates / notes, both layouts, escaping pipe and newlines in table cells, and deterministic output from a fixed snapshot.

- [ ] **Step 2: Run focused parser and export tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bugs::import::tests` and `cargo test --manifest-path src-tauri/Cargo.toml bugs::export::tests`  
Expected: FAIL because the Rust import / export modules and commands are not implemented.

- [ ] **Step 3: Implement import preview and idempotent commits**

Reject input larger than 2 MiB and more than 2,000 valid rows. Return original source line, unmodified text, normalized title, checked draft, duplicate marker, and parse / validation errors per row. Same-batch exact duplicates select the first row by default; existing same-space and same-project titles are warnings. Commit rechecks row uniqueness and validators before persisting.

- [ ] **Step 4: Implement Markdown snapshots and file-save command**

Generate complete and compact reports from the same authoritative Rust renderer. Always include ID, code, title, Chinese status, priority and all three dates; include optional fields / details per selection. Escape cells independently from Markdown detail blocks. Snapshot fixes creation time, scope, row revisions, totals, and generated bytes.

- [ ] **Step 5: Register commands and add typed API wrappers**

Register every BUG command in `generate_handler!`, implement thin state / repository wrappers, and add wrappers to `src/lib/api.ts`. Build must catch missing command argument names, response types, and enum mismatches.

- [ ] **Step 6: Run focused tests and compile checks**

Run: `cargo test --manifest-path src-tauri/Cargo.toml bugs::`  
Run: `npm run build`  
Expected: PASS; invalid rows return structured results and do not create partial duplicate records.

### Task 5: BUG workspace user interface

**Files:**
- Create: `src/pages/BugsPage.tsx`
- Create: `src/components/bugs/BugForm.tsx`
- Create: `src/components/bugs/BugDetails.tsx`
- Create: `src/components/bugs/BugImportDialog.tsx`
- Create: `src/components/bugs/BugExportDialog.tsx`
- Create: `src/lib/useBugs.ts`
- Create: `src/styles/bugs.css`
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/types.ts`

**Interfaces:**
- `BugsPage({ space, projects, bugs, selectedId, onSelect, onSave, onStatusChange, onArchive, onDelete, onImport, onExport })` owns visible filters, page selection, and details presentation.
- `BugForm({ bug, projects, space, onSave, onCancel })` validates and saves one complete local draft without auto-submitting status changes.
- `BugDetails({ bug, onEdit, onStatusChange, onAppendComment, onClose })` presents attributes, notes, source, dates, and activity.
- `BugImportDialog({ space, projects, onClose, onImported })` uses preview drafts returned by Rust and displays per-row progress.
- `BugExportDialog({ query, selectedIds, onClose })` previews the exact Markdown string returned by Rust and saves that string without regeneration.
- `useBugs` exposes typed loading, refreshing, create / update / status / comment / archive / delete, and import / export requests; errors preserve the current form or preview.

- [ ] **Step 1: Build the list page using existing shared components**

Add the BUG navigation item / page ID. Render status summary, search, property filters, sorting, current-page multi-select, list, empty / error states, and a detail panel. Keep page-size 100 and the stable sort from the spec. Reuse `PageHeader`, `SelectField`, `TextField`, `TextArea`, `Button`, `DialogLayer`, `EmptyState`, and semantic CSS tokens.

- [ ] **Step 2: Implement create, edit, quick status, detail, and activity flows**

Expose every documented BUG field. Use explicit save / cancel for drafts, show server validation on failed save, and keep the form open. Route state changes through `changeBugStatus`, capture a completion date for `done`, and collect required notes before blocked / deferred / cancelled / reopen / failed verification. Mark busy actions disabled and announce success or failure.

- [ ] **Step 3: Implement summary, filters, and bulk actions**

Filter the loaded query consistently; page counts include all matches. Add multi-status, priority, severity, project, text / tag, and due-date filters; support selection clearing on space or result-set changes. Offer batch status, priority, owner, due date, tags, archive, and delete with one result per item.

- [ ] **Step 4: Add meaningful component / helper tests**

Test that changing an unsaved status remains within the form until save, save errors retain title and notes, all terminal statuses show explicit text, and selection scope updates when a filter changes.

- [ ] **Step 5: Run focused frontend tests and production build**

Run: `npm test -- src/lib/bugs.test.ts` and BUG component tests.  
Run: `npm run build`  
Expected: PASS; the normal Task screen still uses `TaskStatus` and existing task commands.

### Task 6: Import and export dialogs

**Files:**
- Modify: `src/components/bugs/BugImportDialog.tsx`
- Modify: `src/components/bugs/BugExportDialog.tsx`
- Modify: `src/pages/BugsPage.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/lib/useBugs.ts`

**Interfaces:**
- Import UI calls `previewBugImport(rawText, options)` before any write; each editable draft retains the backend `batchId`, `rowId`, and source line number.
- Commit calls `importBugs(batchId, selectedRows)`; retries submit only unsuccessful rows with their original row IDs.
- Export calls `prepareBugExport(query, scope, selectedIds, formatOptions)` once, then uses returned `markdown` for preview, copy, and `saveBugExport(path, markdown)`.

- [ ] **Step 1: Add import-dialog behavior tests**

Test text paste, file reading via the existing open/read APIs, default field values, row disable / edit, mixed validation errors, selected count, preview progress, stop-after-current-batch, and retrying a failed row without resubmitting completed rows.

- [ ] **Step 2: Implement import preview, commit, retry, and completion summary**

Use `open` and `readTextFile` to load `.txt` / `.md`; pasted text follows the identical preview path. Display raw and normalized row values and every row error. Validate completion dates for checked rows. Cancel after the active batch and preserve the saved-row summary. Disable commit when no valid rows are selected or any selected row has errors.

- [ ] **Step 3: Add export-dialog behavior tests**

Test chosen IDs vs current result range, compact vs full report, Markdown preview preservation, clipboard failure with selectable text, cancelled file save, and save failure retaining the preview.

- [ ] **Step 4: Implement export scope, preview, copy, and save**

Explicitly show the space / filters / archived option and count. Always include status and BUG / due / completion dates. Use the `save` dialog to select a destination. Pass the displayed snapshot to `saveBugExport` unchanged. Never trigger an implicit wider-space or all-workspace export when the current space is personal or work.

- [ ] **Step 5: Run focused tests and the complete frontend build**

Run: `npm test -- src/lib/bugs.test.ts` and BUG dialog tests.  
Run: `npm run build`  
Expected: PASS with preview and saved bytes equal for the same export operation.

### Task 7: Shared search, Today, projects, and workspace lifecycle

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/TodayPage.tsx`
- Modify: `src/pages/ProjectsPage.tsx`
- Modify: `src/pages/ArchivePage.tsx`
- Modify: `src-tauri/src/storage/database.rs`
- Modify: `src-tauri/src/workspace/repository.rs`
- Modify: `src-tauri/src/backup.rs` only if an explicit entity-kind list excludes workspace JSON files

**Interfaces:**
- `PageId` includes `"bugs"` and `SearchResult["kind"]` includes `"bug"`.
- `TodayPage` receives `bugs: Bug[]` and `onOpenBug(id)`, and surfaces all due-today / overdue non-archived BUGs from the current space.
- `ProjectsPage` receives BUGs grouped by `projectId`, shows independent BUG completion counts, and navigates to `bugs` with the matching project filter.
- `ArchivePage` gets archived BUG metadata, unarchives through `archiveBug(id, false)`, and opens details from the BUG page.

- [ ] **Step 1: Add failing cross-flow tests**

Test BUG search returns kind `bug`; Today excludes cancelled and completed from overdue; project counters do not change normal task completion; archived BUGs can restore; backup restore indexes BUG JSON.

- [ ] **Step 2: Extend shared search and navigation**

Index BUG code, title, description, notes, events and tags. Show BUG result in global search and open `BugsPage` at that ID. Add the page to navigation, type definitions, load / reload state, and selected-result clearing on space change.

- [ ] **Step 3: Extend Today and project navigation**

Show due-today and overdue BUG rows with explicit status / due date and open the detail. Display BUG counts independently from Task counts and preserve the project as a BUG list filter when navigating.

- [ ] **Step 4: Integrate archive, trash, backup, restore, and sync checks**

Show archive BUGs and restore actions in the shared archive feed. Reuse bug trash snapshots for restore / permanent-delete behavior. Verify workspace backup includes both BUG directories; after restore, reindex JSON. Inspect `sync.rs` file enumeration and add a BUG file type only when synchronization uses a restrictive list.

- [ ] **Step 5: Run lifecycle and full verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`  
Run: `npm test`  
Run: `npm run build`  
Expected: PASS for all existing tests plus BUG tests; manual smoke check in Tauri confirms create → export → close / reopen → restore / search on both spaces.

### Task 8: UI and failure-path polish

**Files:**
- Modify: `src/styles/bugs.css`
- Modify: `src/pages/BugsPage.tsx`
- Modify: `src/components/bugs/BugForm.tsx`
- Modify: `src/components/bugs/BugImportDialog.tsx`
- Modify: `src/components/bugs/BugExportDialog.tsx`

- [ ] **Step 1: Verify narrow, normal, wide, light, and dark layouts**

Review 320 px, 800 px, and 1440 px widths. Verify the list / detail reflow; dialogs scroll internally with fixed actions; long Markdown text wraps; buttons remain reachable; tokens provide status contrast in both themes.

- [ ] **Step 2: Cover failure and interruption behavior**

Test stale revision, invalid date, duplicate reference, offline command failure, failed import row, clipboard denial, cancelled save and unwritable destination. Ensure existing input or exact Markdown preview remains available after failure.

- [ ] **Step 3: Run final checks**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`  
Run: `cargo test --manifest-path src-tauri/Cargo.toml`  
Run: `npm test`  
Run: `npm run build`  
Expected: all pass with no new Cargo dependency and no unrelated Task behavior change.
