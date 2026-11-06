# Node 环境配置记录

> 记录本项目开发环境中 Node / npm 相关的配置与排查过程，方便以后遇到问题时快速定位。
> 最后更新：2026-09-21

## 一、Node 版本管理

- 项目 `.nvmrc` 指定 Node 版本：**`v22.22.2`**
- 切换命令：`nvm use`（自动读取 `.nvmrc`）或 `nvm use v22.22.2`
- ✅ nvm 默认 alias 已设为 `v22.22.2`（2026-09-21 设置），新开 shell 默认即 v22

## 二、npm 镜像（registry）

当前使用 **npmmirror**（阿里，原淘宝镜像的新地址）：

- 配置文件：`~/.npmrc`
- 内容：`registry=https://registry.npmmirror.com/`

### 国内镜像可用性（2026-09 实测）

| 镜像 | 地址 | 状态 |
|------|------|------|
| npmmirror（阿里） | `https://registry.npmmirror.com/` | ✅ 可用（推荐，同步最及时） |
| 华为云 | `https://mirrors.huaweicloud.com/repository/npm/` | ✅ 可用（测速最快） |
| 腾讯云 | `https://mirrors.cloud.tencent.com/npm/` | ✅ 可用 |
| 清华 TUNA | — | ❌ 已停（404） |
| 中科大 USTC | — | ❌ 已停（404） |
| 网易 163 | — | ❌ 已停（404） |

### nvm 二进制镜像（node / npm 本体下载源）

配置在 `~/.zshrc` / `~/.bashrc` 中：

- `NODE_MIRROR=https://npmmirror.com/mirrors/node/`
- `NPM_MIRROR=https://npmmirror.com/mirrors/npm/`
- `NODIST_NODE_MIRROR=https://npmmirror.com/mirrors/node`
- `NODIST_NPM_MIRROR=https://npmmirror.com/mirrors/npm`
- `PUPPETEER_DOWNLOAD_HOST=https://npmmirror.com/mirrors`

> 这些只影响 `nvm install` 下载 node/npm 本体，不影响 `npm install` 装项目依赖（后者看 `registry`）。

## 三、npm install 失败排查记录（2026-09-21）

### 现象

`nvm use v22.22.2` 后 `npm install` 持续失败。

### 根因（三层，按暴露顺序）

1. **`node_modules` 损坏**：残留 21 个 `.xxx-XXXXXX` 临时目录（上次 install 中断留下），导致 `ENOTEMPTY` rename 失败。
2. **`package-lock.json` 锁死携程内网仓库**：506 个包的 `resolved` 字段全部指向 `artifactory.release.ctripcorp.com`（携程内网 Artifactory），离开内网后 DNS 解析失败 `ENOTFOUND`，全部下载失败。
3. **`~/.npmrc` registry 指向废弃的淘宝旧地址** `http://registry.npm.taobao.org/`（已 301 迁移）。

### 修复步骤

```bash
# 1. 更新 registry 为 npmmirror（~/.npmrc）
#    registry=https://registry.npmmirror.com/

# 2. 删除损坏的 node_modules
rm -rf node_modules

# 3. 删除锁死内网地址的 package-lock.json
#    （该文件被 .gitignore 忽略，属本地文件，重装时自动重新生成）
rm -f package-lock.json

# 4. 切换 node 版本并重装
nvm use v22.22.2
npm install
```

### 排查要点

- `npm config get registry` 看当前镜像源。
- `grep -oE '"resolved": "https?://[^/"]+' package-lock.json | sort | uniq -c` 看 lock 文件锁定的下载源。
- 若 `npm install` 报 `ENOTFOUND`，先确认日志里的域名是否为内网/已失效域名。

## 四、shell 配置修改记录

> 背景：`~/.zshrc` 是符号链接，真实路径为 `~/.config/zshrc`。

### `~/.zshrc`（→ `~/.config/zshrc`）

- 删除 `jade` 用户残留：`NODE_BASE=/home/jade/.nvm/...`、`NODE_PATH=$NODE_BASE/lib/node_modules`
- 删除 `PATH` 中的 jade 残留：`$NODE_BASE/bin`、`/home/jade/algs4/bin`
- 淘宝镜像 → npmmirror：`NODE_MIRROR` / `NPM_MIRROR` / `NODIST_*` / `PUPPETEER_DOWNLOAD_HOST`

### `~/.bashrc`

- 删除 `NODE_BASE` / `NODE_PATH` 及 `PATH=$PATH:$NODE_BASE/bin`
- 淘宝镜像 → npmmirror（同上）

## 五、已知遗留事项

| 事项 | 说明 | 处理 |
|------|------|------|
| 已运行进程的 PATH 含旧 jade 路径 | VSCode 等已启动进程继承旧环境变量 | 重启终端 / VSCode 后消失 |
| `.zshrc` 报 `touch: cannot touch '/:home:...'` | 来自"每目录独立历史"功能的 `${PWD//\//:}`，与 npm 无关 | 可选：禁用该功能或修正路径 |
