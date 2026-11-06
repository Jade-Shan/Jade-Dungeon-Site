#!/bin/bash
# 库的构建：npm 包 + CDN 产物
#
# 三条链：
#
#   dist/                     npm 包（tsc，无 sourcemap）—— **site-page 编译要用它的 .d.ts**
#   webroot/themes/window-ui  window-ui 主题的 Less
#   webroot/scripts/ts        CDN 的 TypeScript（含压缩）
#
# **`build:pkg` 排在最前面是有意的**：从 git 新拉下来的代码里没有 `dist/`
# （它在 .gitignore 里），而 site-page 用包名 import 库、解析到
# `common-utils/dist/*.d.ts`。本脚本自己生成它，这样「先构建库」
# 这件事不再依赖调用方记得多跑一条命令。
# 详见 docs/refactor-20261101.md 第 25 节与 26.2 节。
#
# 用法：cd common-utils && bash build.sh    或    npm run build -w common-utils

set -e
cd "$(dirname "$0")"

echo '=== common-utils: start ==='

echo '--- start : build npm package (dist/) ---'
npm run build:pkg
echo '--- finish : build npm package ---'

echo '--- start : build css (window-ui) ---'
npx gulp process-style-window-ui
echo '--- finish : build css ---'

echo '--- start : compile typescript ---'
npx gulp compress-typescript
echo '--- end : compile typescript ---'

echo '=== common-utils: done。产物在 common-utils/webroot/ ==='


# scp -r webroot/*   username@host:/jadeutils.v5-path
#  cp -r webroot/*   jadeutils.v5-path

