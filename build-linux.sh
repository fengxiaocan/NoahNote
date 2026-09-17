#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js LTS。" >&2
  exit 1
fi

if [[ $# -gt 1 || ( $# -eq 1 && "${1:-}" != "--install" ) ]]; then
  echo "用法：$0 [--install]" >&2
  exit 2
fi

if [[ "${1:-}" == "--install" || ! -d "node_modules" ]]; then
  echo "安装前端依赖..."
  npm ci
fi

echo "构建 Linux AppImage 和 DEB 安装包..."
npm run tauri build -- --bundles appimage,deb

echo "Linux 安装包已生成：$project_root/src-tauri/target/release/bundle/appimage 和 $project_root/src-tauri/target/release/bundle/deb"
