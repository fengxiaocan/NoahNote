mod ai;
mod backup;
mod commands;
mod error;
mod models;
mod pdf;
mod plugins;
mod semantic;
mod storage;
mod sync;
mod workspace;

use std::sync::Mutex;

use error::AppError;
use tauri::Manager;

pub struct AppState {
    pub repository: Mutex<workspace::WorkspaceRepository>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app
                .path()
                .app_data_dir()
                .map_err(|error| {
                    Box::new(AppError::Config(format!("无法获取应用数据目录：{error}")))
                        as Box<dyn std::error::Error>
                })?
                .join("workspace");
            let repository = workspace::WorkspaceRepository::open(root)
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            if let Err(error) = backup::maybe_create_auto(&repository) {
                eprintln!("自动备份失败：{error}");
            }
            app.manage(AppState {
                repository: Mutex::new(repository),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::list_notes,
            commands::get_note,
            commands::create_note,
            commands::update_note,
            commands::archive_note,
            commands::delete_note,
            commands::list_tasks,
            commands::create_task,
            commands::update_task,
            commands::archive_task,
            commands::delete_task,
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::archive_project,
            commands::delete_project,
            commands::list_inbox,
            commands::create_inbox_item,
            commands::update_inbox_item,
            commands::archive_inbox_item,
            commands::move_inbox_item,
            commands::update_spark_stage,
            commands::delete_inbox_item,
            commands::promote_inbox_item,
            commands::list_events,
            commands::get_event,
            commands::create_event,
            commands::update_event,
            commands::archive_event,
            commands::delete_event,
            commands::list_checklists,
            commands::get_checklist,
            commands::create_checklist,
            commands::update_checklist,
            commands::archive_checklist,
            commands::delete_checklist,
            commands::list_templates,
            commands::get_template,
            commands::create_template,
            commands::update_template,
            commands::archive_template,
            commands::delete_template,
            commands::create_from_template,
            commands::list_knowledge_nodes,
            commands::get_knowledge_page,
            commands::get_knowledge_folder,
            commands::create_knowledge_folder,
            commands::update_knowledge_folder,
            commands::create_knowledge_page,
            commands::update_knowledge_page,
            commands::delete_knowledge_page,
            commands::delete_knowledge_folder,
            commands::copy_note_to_knowledge,
            commands::list_wiki_links,
            commands::list_wiki_backlinks,
            commands::list_versions,
            commands::get_version,
            commands::restore_version,
            commands::list_trash,
            commands::restore_trash_item,
            commands::permanently_delete_trash_item,
            commands::purge_trash,
            commands::search,
            commands::semantic_search,
            commands::list_tags,
            commands::list_documents,
            commands::get_document,
            commands::import_pdf,
            commands::read_pdf,
            commands::export_pdf,
            commands::ocr_pdf,
            commands::delete_document,
            commands::run_ai,
            commands::list_plugins,
            commands::install_plugin,
            commands::set_plugin_enabled,
            commands::add_attachment,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::sync,
            commands::list_sync_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running NoahNote");
}
