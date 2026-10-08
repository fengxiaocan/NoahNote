#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_root"

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm。请先安装 Node.js LTS。" >&2
  exit 1
fi

install_deps=false
bundles="appimage,deb"

for arg in "$@"; do
  case "$arg" in
    --install)
      install_deps=true
      ;;
    --deb|--deb-only|deb)
      bundles="deb"
      ;;
    --appimage|--appimage-only|appimage)
      bundles="appimage"
      ;;
    --all)
      bundles="appimage,deb"
      ;;
    *)
      echo "用法：$0 [--install] [--deb | --appimage | --all]" >&2
      exit 2
      ;;
  esac
done

if [[ "$install_deps" == "true" || ! -d "node_modules" ]]; then
  echo "安装前端依赖..."
  npm ci
fi

# 检查 pkg-config 是否能检测到 appindicator 库（Tauri 构建系统托盘依赖）
if ! pkg-config --exists ayatana-appindicator3-0.1 2>/dev/null && ! pkg-config --exists appindicator3-0.1 2>/dev/null; then
  # 查找系统上已有的 libayatana-appindicator3 或 libappindicator3 动态库
  for lib_dir in /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /usr/local/lib; do
    if [[ -f "$lib_dir/libayatana-appindicator3.so.1" ]]; then
      pc_dir="$(mktemp -d)"
      trap 'rm -rf "$pc_dir"' EXIT
      cat << EOF > "$pc_dir/ayatana-appindicator3-0.1.pc"
prefix=/usr
libdir=$lib_dir
Name: ayatana-appindicator3-0.1
Description: Ayatana Application Indicators
Version: 0.5.93
Libs: -L\${libdir} -layatana-appindicator3
EOF
      export PKG_CONFIG_PATH="$pc_dir:${PKG_CONFIG_PATH:-}"
      export TAURI_LINUX_AYATANA_APPINDICATOR=1
      break
    elif [[ -f "$lib_dir/libappindicator3.so.1" ]]; then
      pc_dir="$(mktemp -d)"
      trap 'rm -rf "$pc_dir"' EXIT
      cat << EOF > "$pc_dir/appindicator3-0.1.pc"
prefix=/usr
libdir=$lib_dir
Name: appindicator3-0.1
Description: Application Indicators
Version: 12.10.1
Libs: -L\${libdir} -lappindicator3
EOF
      export PKG_CONFIG_PATH="$pc_dir:${PKG_CONFIG_PATH:-}"
      break
    fi
  done
fi

echo "构建 Linux 安装包 (目标: $bundles)..."
npm run tauri build -- --bundles "$bundles"

echo "Linux 安装包构建完成："
if [[ "$bundles" == *"appimage"* ]]; then
  echo "  AppImage: $project_root/src-tauri/target/release/bundle/appimage"
fi
if [[ "$bundles" == *"deb"* ]]; then
  echo "  DEB:      $project_root/src-tauri/target/release/bundle/deb"
fi
