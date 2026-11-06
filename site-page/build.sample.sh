#!/bin/bash
# site-page 项目的 CDN 构建
#
# 三条链：主题 Less + 图片、TypeScript 编译（含压缩）、HTML 模板展开。
# 产物在 site-page/webroot/。
#
# **编译 TS 之前库必须先 build:pkg**。site-page 用包名 import 库，解析链：
#
#   node_modules/@jade-dungeon/jade-utils   ← npm install 建的符号链接
#     → common-utils/package.json 的 exports（types 字段）
#       → common-utils/dist/*.d.ts          ← build:pkg 生成的，**唯一要先构建的一环**
#
# 根上的 `npm run build` 和 build.sample.sh 已排好顺序；
# `common-utils/build.sh` 自己也会先 build:pkg。
# **单独跑本脚本**时要么先跑库的 build.sh、要么 `npm run build:pkg -w common-utils`。
#
# 漏跑的报错会带偏：实测 185 个错里只有 31 个 TS2307（找不到模块），
# 其余 131 个 TS2339「属性不存在」都是类型解析失败的连带效应。
# 看到成片 TS2339 先确认 common-utils/dist/ 在不在 ——
# 所以下面加了一道前置检查，把这个报错提前到构建开始之前。
#
# **本脚本不替站点构建库** —— 那会变成站点侧伸手去 ../common-utils 跑构建，
# 正是拆分要消除的耦合（库将来独立成 git 仓库，那边没有库的源码）。
# 这里只检查、只报错，不动手。
#
# 用法：cd site-page && bash build.sh    或    npm run build -w site-page

set -e
cd "$(dirname "$0")"

# ========================================
# 前置检查：库的 .d.ts 在不在
#
# 按 tsc 真实的解析顺序找，三个位置都认：
#   ① 根上的 node_modules（workspaces 会把符号链接提到根）
#   ② 本目录的 node_modules（方案 A 的 file: 依赖装在这里）
#   ③ 兄弟目录（没装依赖、直接看源码树的情况）
# ========================================
LIB_DTS=
for p in \
	../node_modules/@jade-dungeon/jade-utils/dist/basic.d.ts \
	./node_modules/@jade-dungeon/jade-utils/dist/basic.d.ts \
	../common-utils/dist/basic.d.ts
do
	[ -f "$p" ] && { LIB_DTS="$p"; break; }
done

if [ -z "$LIB_DTS" ]; then
	echo '!!! 库的 dist/*.d.ts 不存在，site-page 编译不过。' >&2
	echo '    site-page 用包名 import 库，类型来自 common-utils/dist/*.d.ts，' >&2
	echo '    而 dist/ 在 .gitignore 里 —— 从 git 新拉下来的代码里没有它。' >&2
	echo '' >&2
	echo '    先跑这个：' >&2
	echo '      bash ../common-utils/build.sh          # 它自己会先 build:pkg' >&2
	echo '      或  npm run build:pkg -w common-utils  # 只打包，不做 CDN 构建' >&2
	echo '' >&2
	echo '    从根上跑 bash build.sh 的话顺序已经排好了，不会碰到这个。' >&2
	exit 1
fi
echo "--- check : 库的类型声明在 $LIB_DTS ---"

echo '=== site-page: start ==='

echo '--- start : build css ---'
npx gulp process-style-hobbit
npx gulp process-style-lo-fi
npx gulp process-style-paper-print
npx gulp process-style-workout
npx gulp process-style-trpg
npx gulp process-style-site
echo '--- finish : build css ---'

echo '--- start : compile typescript ---'
npx gulp compress-typescript
echo '--- end : compile typescript ---'

echo '--- start : process-html ---'
npx gulp include-html-dev
echo '--- end : process-html ---'

echo '=== site-page: done。产物在 site-page/webroot/ ==='

# 库的文档拷进自己的产物 → webroot/docs/
#
# **这一步不能省** —— html/index.html 里那 5 条文档链接指向
# `@@staticRoot/docs/xxx.md`（= jadesites.v5/docs/），也就是**本模块的 CDN**。
# 文件来源却是 common-utils/docs/，所以要在这里搬一次。
# 链接是绝对 URL 不代表不用搬 —— 那只是把地址写死了，文件还是得送到那个地址。
cp -r ../common-utils/docs    webroot/
# scp -r webroot/*   username@host:/jadesites.v5-path
#  cp -r webroot/*   jadesites.v5-path
