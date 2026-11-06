#!/bin/bash
# 全量 CDN 构建 + 部署
#
# 切 workspaces 之后这个脚本只做编排，实际构建在两边各自的 build.sh 里
# （见 docs/refactor-20261101.md 第 18 节的决定 16）：
#
#   common-utils/build.sh   dist/ + window-ui 主题 + TS  → common-utils/{dist,webroot}/
#   site-page/build.sh   三套内容主题 + workout/trpg/site 图片 + TS + HTML
#                                        → site-page/webroot/
#
# **顺序不能反**：site-page 侧用包名 import 库，要先有 common-utils/dist/ 才能编译。
#
# ── 从 git 新拉下来的代码，跑本脚本之前要做三件事 ──
#
#   nvm use                                        # .nvmrc 的 v22.22.2
#   npm install                                    # 建 @jade-dungeon/* 符号链接
#   cp site-page/envs.sample.js site-page/envs.js  # 它在 .gitignore 里
#
# `dist/` 不用手动管 —— common-utils/build.sh 自己会先 build:pkg。
# 完整的准备清单见 README.md「首次克隆后的准备」与 docs/refactor-20261101.md 第 26 节。
#
# **两边各自发到不同的 CDN,不再合并**（第 22 节）。
# 生产部署由两边自己的 build.sh 末尾 scp 完成：
#
#   common-utils/webroot/  →  jadecdn/webroot/jadeutils.v5   （@@libRoot）
#   site-page/webroot/     →  jadecdn/webroot/jadesites.v5   （@@staticRoot）
#
# 所以**根目录下不再有 webroot/** —— 原来那棵合并树已经没有用途了。
# 本脚本只剩两件事：排好构建顺序、把两边的产物拷到本地 nginx 做开发期验证。

set -e
cd "$(dirname "$0")"

# ========================================
# copy 3rd lib
# 第三方的库改用外部引用，不再复制一份出来了
# ========================================
# echo '--- start : copy 3rd lib ---'
# mkdir -p site-page/webroot/3rd/
# rm -rf site-page/webroot/3rd/*
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/jquery            ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/datatable         ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/bootstrap         ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/SyntaxHighlighter ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/showdown          ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/mathjax           ./site-page/webroot/3rd
# cp -r ~/workspace/nginx/jadecdn/webroot/3rd/98.css            ./site-page/webroot/3rd
# echo '--- finish: copy 3rd lib ---'

# ========================================
# 库：先打 npm 包（site-page 侧编译要用 common-utils/dist/ 的 .d.ts），再做 CDN 构建
#
# **这里的 build:pkg 和 common-utils/build.sh 里的那条是重复的**，故意留着：
#
#   - 它把「库的包要先于站点构建」这个约束**写在编排层**，
#     读这个脚本的人不用点进 common-utils/build.sh 才知道顺序
#   - test/arch.split.test.ts 有一条用例盯着它在 site-page/build.sh 之前
#   - 重复的代价只有一次 tsc（约 2 秒），而且幂等
#
# 用 `cd` 而不是 `-w` 是有意的：符号链接缺失时 `-w` 会回退去跑根自己的
# 同名 script，自我调用成无限递归（18.17 节踩过，32 分钟 fork 出 721 个进程）。
# `cd` 形式没有这个退化路径 —— 目录不对就直接报错。
# ========================================
echo '=== 1/3 lib ==='
(cd common-utils && npm run build:pkg)
bash common-utils/build.sh

# ========================================
# site-page 项目
# ========================================
echo '=== 2/3 web ==='
bash site-page/build.sh

# ========================================
# deploy local server
#
# **两个目标分开拷,不合并** —— 和生产的两个 CDN 一一对应,
# 这样本地验证的路径结构和线上一致。合并着拷会让
# 「@@libRoot / @@staticRoot 用错了」这类问题在本地看不出来（19.8 节踩过）。
#
# 本机没装 nginx 时跳过，不让它中断构建 —— 这一段是本地便利，
# 不是构建的一部分。切分之前这个脚本没有 set -e，cp 失败只打一行错误就继续；
# 加了 set -e 之后要显式处理，否则没有 nginx 的机器上构建会在这里中断。
# ========================================
echo '=== 3/3 deploy to local nginx ==='
NGINX_ROOT=~/workspace/nginx/jadecdn/webroot
if [ -d "$NGINX_ROOT" ]; then
	# 库 → jadeutils.v5（对应 envs.js 的 libRoot）
	LIB_DST="$NGINX_ROOT/jadeutils.v5"
	mkdir -p "$LIB_DST"
	rm -rf "$LIB_DST"/*
	cp -r common-utils/webroot/* "$LIB_DST"
	echo "--- lib  → $LIB_DST ---"

	# 站点 → jadesites.v5（对应 envs.js 的 staticRoot）
	SITE_DST="$NGINX_ROOT/jadesites.v5"
	mkdir -p "$SITE_DST"
	rm -rf "$SITE_DST"/*
	cp -r site-page/webroot/* "$SITE_DST"
	echo "--- site → $SITE_DST ---"
else
	echo "--- skip  : 本机没有 $NGINX_ROOT，跳过部署 ---"
fi

# 页面挪进 html/blog/ 之后的路径（阶段 4）
# cp site-page/webroot/html/blog/blog.html    ~/workspace/nginx/jadedungeon-v2/webroot/index.html
# cp site-page/webroot/html/blog/gallery.html ~/workspace/nginx/jadedungeon-v2/webroot/gallery.html
# cp site-page/webroot/html/blog/blog.html    ~/workspace/nginx/jadedungeon/webroot/index.html
# cp site-page/webroot/html/blog/gallery.html ~/workspace/nginx/jadedungeon/webroot/gallery.html

sleep 3 && sync

# cp -r ~/sync-prj/* . && sync && bash build.sh && sync
