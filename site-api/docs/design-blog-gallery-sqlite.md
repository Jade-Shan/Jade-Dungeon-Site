# blog / gallery 数据从 Redis 迁到 SQLite —— 可行性与表结构设计

状态：**✅ 已实施完成**（2026-11-04）
拟定日期：2026-11-04

## 实施结果速览

7 项决策的最终选择与落地：

| # | 事项 | 决策 | 落地 |
|---|------|------|------|
| 1 | 坏数据 | 用户已自行处理 | 迁移前实测全库 0 条坏数据 |
| 2 | 列表页正文 | 只返回摘要 + 新增单篇接口 | `loadByUser` 去掉 `text`、加 `id`；新增 `getArticle` / `getAlbum`；备份脚本改用新接口 |
| 3 | gallery 图片 | 方案 A 子表 | `gallery_album` + `gallery_photo`，写入走事务 |
| 4 | 两个假数据接口 | 照搬 | `loadUserById` / `loadRecommandArticles` 原样返回硬编码数据 |
| 5 | Redis 旧数据 | 保留不动 | 迁移脚本只读不写 Redis |
| 6 | 并行期 | 旧后端不再使用 | 未做数据双向兼容 |
| 7 | token 校验 | 照搬（不校验） | 两个 save 接口仍信客户端传的 `userId` |

### 搬迁结果

```
blog_article  215 行    （guest 6 / teo 36 / u001 173）
gallery_album  45 行    （guest 8 / teo 5 / u001 32）
gallery_photo 274 行
数据库体积   2.99 MB
解析失败       0 条
```

12 项一致性校验全过：条数、按作者分组、**全部 215 篇正文的 SHA256 指纹**、
45 组相册的 274 张图片 URL 逐一比对。

### 后续追加：摘要字段（2026-11-04）

迁移完成后补做的。原先决策 2 只是「列表不返回正文」，并没有生成摘要——
列表只返回 `id / auth / title / time` 四个元数据字段。补上 `excerpt` 后：

- 表加 `excerpt TEXT NOT NULL DEFAULT ''`，走 `db/index.ts` 的 `COLUMN_MIGRATIONS` 机制
  （`CREATE TABLE IF NOT EXISTS` 对已有表不生效，必须 `ALTER TABLE`）
- `makeExcerpt()` 用正则剥离 Markdown，**不引解析库**——实测 215 篇只用到 8 种语法，
  斜体、代码块、HTML 标签、表格完全没出现
- 摘要在**写入时**生成，列表查询只读这一列，不碰 34.7 KB 的大字段
- 回填脚本 `scripts/backfillExcerpt.ts`，**215 篇全部生成摘要**

剥离的三个决策：

| 情况 | 处理 |
|------|------|
| 图片 `![alt](url)` | 整条删掉——alt 多是 `![alt 青铜虎尊](url)` 这类标注，不是正文 |
| 链接 `[文字](url)` | 只留显示文字 |
| 剥离后无文字但原文有图片 | 摘要为 `（图片）` 占位（实测 1 篇，id=203） |

最后一条靠剥离**之前**记下的 `hadImage` 标志实现，用来区分
「纯图片文章」和「原文本身为空」——后者摘要仍是空串。

全量检查零残留标记。摘要共占 88 KB。

### 新增文件

| 文件 | 职责 |
|------|------|
| `service/blogService.ts` | 博客与相册的数据访问、分页归一化、字段名映射、摘要生成 |
| `routes/blog.ts` | 5 个接口（含新增的 `getArticle`） |
| `routes/gallery.ts` | 3 个接口（含新增的 `getAlbum`） |
| `scripts/migrateBlogRedisToSqlite.ts` | 搬迁脚本，默认演练、需 `--write` 才写入 |
| `scripts/backfillExcerpt.ts` | 回填摘要，默认演练；`--all` 可在改了剥离逻辑后重算全部 |
| `scripts/backupBlogData.ts` | 备份脚本，取代旧后端的 `backup.js` |

### 实施中踩的一个坑

搬迁脚本第一版把**全部 45 组相册的时间戳写成了迁移时刻**。

根因：两个模块存 `time` 的类型不一致——`blog.js` 对 `data.params.time` 做了
`parseInt` 存为 number，而 `gallery.js` 直接用原值存为 **string**。
脚本里用 `Number.isFinite(rec.time)` 判断有效性，而它**不做类型转换**，
对字符串 `"1770588479999"` 返回 false，于是落到了 `Date.now()` 兜底分支。

发现方式是迁移后的一致性校验——按 `(author, created_at, title)` 查不到对应相册，
45 组全部报错。修正为显式的 `toEpoch()` 归一化后重新搬迁，校验通过。

> 教训：`Number.isFinite` 不等于「能转成有限数字」。要兼容字符串得先 `Number()` 再判断。

下面是实施前的调研与设计，保留备查。

## 一、结论先说

**建议迁移。** Redis 的 List 结构已经在拖累这两个模块——现有实现里
分页算错、无法按单篇查询、改一篇要重写整个列表，这些都是数据结构选得不合适导致的，
不是代码写得不好。

但有两件事要先确认，见第七节。

## 二、现状调研（2026-11-04 实测）

### 数据存储形态

| Redis key | 类型 | 元素数 | 大小 |
|-----------|------|--------|------|
| `jadedungeon::blog::u001` | List | 179 | 7.69 MB |
| `jadedungeon::blog::teo` | List | 36 | 0.01 MB |
| `jadedungeon::blog::guest` | List | 6 | ~0 |
| `jadedungeon::gallery::u001` | List | 32 | 0.03 MB |
| `jadedungeon::gallery::teo` | List | 5 | ~0 |
| `jadedungeon::gallery::guest` | List | 8 | ~0 |
| **合计** | | **266 条** | **7.73 MB** |

**是真实数据，不是测试数据**（与 auth 那 5 个账号不同）。每个用户一个 List，
`lPush` 插入到头部（所以是倒序），整条记录是一个 JSON 字符串。

### 记录结构

blog：

```json
{ "time": 1791806460612, "auth": "u001", "title": "...", "text": "..." }
```

gallery：

```json
{ "time": ..., "auth": "u001", "title": "...", "text": "...",
  "ablum": [ { "id": 0, "title": "", "desc": "", "url": "http://..." } ] }
```

> `ablum` 是 `album` 的拼写错误。上面这段 JSON 是**旧 Redis 数据的原样**，
> 所以保留错拼写。
>
> **响应 JSON 那边 2026-11-05 已经改正成 `album`** —— 旧后端停用、前端只剩
> `site-page`，两边一起改的。读旧数据的
> `scripts/migrateBlogRedisToSqlite.ts` 仍用 `ablum`，因为它读的就是上面这个形状。
>
> sandtable 的 `scence` **没跟着改**：它是 Redis key 的一部分，
> 改名要迁移存量数据，不是改个字段名的事。

### 正文体积

blog 的 `text` 字段：平均 34.7 KB，**最长 1.3 MB**（u001 索引 176 那条）。
gallery 单组最多 19 张图，u001 的 32 组共 248 张。

### ⚠️ 已有 1 条坏数据

```
jadedungeon::blog::u001  索引 176，长度 1226083 字节，JSON.parse 失败
开头: {"time":1767729476495,"auth":"u001","title":"沈逸宣扬的是什么史观？日寇侵华...
```

1.2 MB 的记录解析失败，推测是写入时被截断。
**现有的 `loadByUser` 遇到它会静默吞掉整页剩余文章**——
它的循环没有逐条 try/catch，一条坏数据会让 `for` 在中途抛错，
而外层 catch 只打日志，已 push 的部分照样返回。所以那一页会少文章且无任何提示。

迁移时必须决定这条数据怎么处理（见第七节）。

## 二之二、谁在调这些接口（影响几项决策）

全仓库搜了一遍调用方，分布和预想的不一样：

| 接口 | 调用方 |
|------|--------|
| `blog/loadUserById` | 前端 `Jade-Dungeon-page/src/scripts/base.js:225` |
| `blog/loadRecommandArticles` | 前端 `Jade-Dungeon-page/src/scripts/base.js:255` |
| `blog/loadByUser` | **备份脚本** `backup.js:52`、`backup-blog-data.js:52` |
| `gallery/loadByUser` | **备份脚本** `backup.js:58`、`backup-blog-data.js:58` |
| `blog/save` | **静态页表单** `static/html/blog/blog.html`（`method="POST"`） |
| `gallery/save` | **静态页表单** `static/html/blog/gallery.html`（`method="POST"`） |

三点推论：

**① 前端只用那两个返回假数据的接口。** 真正读写数据的 4 个接口，
前端 `sandtable-*.js` / `base.js` 里都没有调用。所以决策 2
（列表页是否返回正文）**不影响前端**，只影响备份脚本。

**② 读接口的实际用途是备份。** 备份脚本用 `pageSize=65535` 一次性拉全量，
所以它恰好绕过了分页 bug。但它会把 7.69 MB 正文全量拉下来写成 JSON 文件——
这是它的本意（备份就该全量），所以列表页若改成不返回正文，
**备份脚本需要同步改**（改用新增的单篇接口，或给它一个专用的全量导出）。

**③ 写接口是静态页的原生表单 POST。** 不是 ajax，是
`<form action="/api/blog/save" method="POST" enctype="multipart/form-data">`。
这意味着：

- 表单里**没有 token 字段**，所以决策 7（接 token 校验）需要改这两个静态页
- 原生表单提交后浏览器会跳转到响应内容，而当前响应是 JSON——
  用户会看到一行 `{"status":"success"}` 的裸文本。这是既有的体验问题，不在本次范围

## 三、为什么 Redis List 不合适

这不是「Redis 不好」，而是**用 List 存文章这个选择**带来的具体问题：

### 3.1 分页数本来就是算错的

```javascript
// blog.js:77-81
if (recCount < pageSize) { json.pageCount = 1; }
else { json.pageCount = parseInt((recCount + 1) / pageSize); }
```

实测对比（每页 10 条）：

```
  条数  旧公式  正确  一致?
     6      1      1  ✅
    11      1      2  ❌ 差 1
    36      3      4  ❌ 差 1      ← teo 的实际条数
   179     18     18  ✅          ← u001 的实际条数（碰巧对）
   181     18     19  ❌ 差 1
   191     19     20  ❌ 差 1
```

**这不是边界情况，而是现在就在发生的 bug**：`teo` 有 36 篇文章，
旧公式告诉前端只有 3 页，所以**第 4 页的 6 篇文章现在根本打不开**。
`u001` 的 179 条碰巧算对了，所以这个 bug 一直没被注意到。

正确写法是 `Math.ceil(recCount / pageSize)`。用 SQL 的 `COUNT(*)` 配 `ceil` 就不会错。

### 3.2 无法按单篇查询

List 只能按下标范围取。想「打开某一篇文章」就得知道它在列表里的位置，
而位置会随新文章插入而变化。所以现在**没有「查看单篇」的接口**，
前端只能把整页拉下来再在内存里找。SQLite 下 `WHERE id = ?` 即可。

### 3.3 改一篇要重写整个列表

Redis List 没有「按条件更新某个元素」的操作。要编辑一篇文章，
只能 `lRange` 全取 → 在内存里改 → `del` + 重新 `lPush` 全部。
对 u001 那 7.69 MB 来说，一次编辑要搬 7.69 MB 数据。
所以现在**也没有编辑和删除接口**。

### 3.4 无法跨用户查询

`loadRecommandArticles`（推荐文章）现在返回的是**硬编码的假数据**
（`Jade-TRPG-api/javascript/blog/blog.js:37~47`），
因为按 List 的结构没法「从所有用户里挑最新/最热的几篇」。
SQLite 下就是一句 `ORDER BY time DESC LIMIT 2`。

同理 `loadUserById` 返回的用户信息也是硬编码的假数据。

### 3.5 全表扫描才能搜索

想按标题搜文章，Redis 下只能全量取出在应用层过滤。
SQLite 可以建索引，或用 FTS5 做全文检索。

## 四、SQLite 是否吃得消

### 体积

7.73 MB 的数据，SQLite 毫无压力。单条 1.3 MB 的 TEXT 也在限度内
（SQLite 默认单字段上限 1 GB）。

### 性能

现有连接池实测：8 并发读 2.5 万次/秒，写 5000+ 次/秒。
个人站点的博客访问量远低于此。

需要注意的是**大字段的读取**：列表页不该把 1.3 MB 的正文一起取出来。
表结构设计里用「列表查询只取摘要字段」来避免（见 5.3）。

### 事务

gallery 的「一组相册 + N 张图片」需要原子写入。实测 `exec('BEGIN;...;COMMIT;')` 可用且能正确回滚。

## 五、表结构设计

### 5.1 blog

```sql
CREATE TABLE IF NOT EXISTS blog_article (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author     TEXT    NOT NULL,          -- 旧字段名 auth，存 userId
    title      TEXT    NOT NULL,
    text       TEXT    NOT NULL,          -- 正文，可能很大（实测最长 1.3 MB）
    excerpt    TEXT    NOT NULL DEFAULT '',  -- 2026-11-04 追加：列表页用的纯文本摘要
    created_at INTEGER NOT NULL,          -- 旧字段 time，epoch ms
    updated_at INTEGER NOT NULL
);

-- 列表页按作者 + 时间倒序分页，这个复合索引直接支撑该查询
CREATE INDEX IF NOT EXISTS idx_blog_author_time ON blog_article(author, created_at DESC);
-- 跨用户的「最新文章」查询（推荐位用）
CREATE INDEX IF NOT EXISTS idx_blog_time ON blog_article(created_at DESC);
```

### 5.2 gallery

相册有嵌套的图片数组，两种存法：

**方案 A：子表（推荐）**

```sql
CREATE TABLE IF NOT EXISTS gallery_album (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author     TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    text       TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery_photo (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    -- 旧数据里的 id 是组内序号（0,1,2...），不是全局唯一，保留它以维持顺序
    seq      INTEGER NOT NULL,
    title    TEXT    NOT NULL DEFAULT '',
    desc     TEXT    NOT NULL DEFAULT '',
    url      TEXT    NOT NULL,
    FOREIGN KEY (album_id) REFERENCES gallery_album(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_album_author_time ON gallery_album(author, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_album ON gallery_photo(album_id, seq);
```

**方案 B：JSON 列**

```sql
CREATE TABLE IF NOT EXISTS gallery_album (
    ...
    photos TEXT NOT NULL   -- 原样存 ablum 数组的 JSON
);
```

| | 方案 A 子表 | 方案 B JSON 列 |
|---|-----------|---------------|
| 迁移复杂度 | 需要拆数组、两表插入（要事务） | 原样塞进去 |
| 单张图片查询 / 统计 | ✅ SQL 直接做 | 要在应用层解 JSON |
| 改单张图片 | ✅ `UPDATE ... WHERE id` | 读出整个 JSON → 改 → 写回 |
| 响应 JSON 的拼装 | 要 JOIN 后组装回 `ablum` 数组 | 直接 `JSON.parse` |
| 与旧数据的相似度 | 低 | 高 |

**人家倾向方案 A**。相册的图片是独立实体（有标题、描述、URL），
将来「删掉某张图」「统计某用户有多少张图」都是自然需求。
方案 B 只是把 Redis 的问题换个地方重演——仍然改一张图要重写整组。

单组最多 19 张图，JOIN 的成本可以忽略。

### 5.3 避免列表页拉取大字段

blog 列表页只需要标题和时间，不该把 1.3 MB 正文一起读出来：

```sql
-- 列表：不取 text
SELECT id, author, title, created_at FROM blog_article
 WHERE author = ? ORDER BY created_at DESC LIMIT ? OFFSET ?;

-- 单篇：才取 text
SELECT * FROM blog_article WHERE id = ?;
```

但这会**改变响应结构**——现有 `loadByUser` 返回的 `articles` 里带着完整 `text`。
见第七节的决策 2。

### 5.4 字段命名的取舍

旧数据/响应用 `auth`、`time`、`ablum`，都不太规范（`ablum` 还是拼写错误）。

建议**表结构用规范命名**（`author` / `created_at` / `photos`），
**响应 JSON 保持旧字段名**，在服务层做一次映射。理由：

- 表结构是新建的，没有兼容负担，用规范名字对后续开发更友好
- 响应字段改了会断前端，而前端改动不在本次范围

映射关系写在 `service/blogService.ts` 里，集中一处。

## 六、数据搬迁方案

### 搬迁脚本

实际实现为 `src/main/ts/scripts/migrateBlogRedisToSqlite.ts`，手动执行、幂等（可重复运行）：

1. `SCAN` 匹配 `jadedungeon::blog::*`，对每个 key 取出 userId
2. `lRange key 0 -1` 全量取出（注意是 `lPush` 插入，所以下标 0 是最新）
3. 逐条 `JSON.parse`，**单条失败不中断**，记录到失败清单
4. 插入 `blog_article`，`created_at` 用记录里的 `time`
5. gallery 同理，但要拆 `ablum` 数组插入 `gallery_photo`，**整组用一个事务**
6. 输出报告：成功 N 条、失败 M 条及其定位
7. **不删除 Redis 原数据**，保留以便回滚和比对

### 幂等性

用 `(author, created_at)` 判重——同一作者同一毫秒发两篇的概率可以忽略。
重跑时跳过已存在的记录。

### 那条坏数据

实测 `jadedungeon::blog::u001` 索引 176 的记录（1.2 MB）无法 `JSON.parse`。
三种处理方式见第七节决策 1。

## 七、需要您决策的事项

| # | 事项 | 选项 |
|---|------|------|
| 1 | **坏数据** | ① 跳过并记录（数据丢失 1 篇）<br>② 尝试截断修复：它开头是合法 JSON，可能只是尾部被截断，可以试着补全<br>③ 先导出那 1.2 MB 原文到文件，人工检查后再定 |
| 2 | **列表页是否返回正文** | 前端不调这个接口，**只影响备份脚本**（见 2.2 节）。<br>① 保持现状（返回完整 `text`）<br>② 列表只返回摘要 + 新增单篇接口，备份脚本改用新接口 |
| 3 | **gallery 的图片** | ① 方案 A 子表（推荐）<br>② 方案 B JSON 列 |
| 4 | **两个假数据接口** | `loadUserById` 和 `loadRecommandArticles` 现在返回硬编码假数据。<br>① 照搬（继续返回假数据）<br>② 实现成真的查询（需要用户表——auth 已有 `auth_user`，可以用） |
| 5 | **Redis 旧数据** | ① 保留不动（推荐，便于回滚）<br>② 迁完即删 |
| 6 | **并行期** | 迁移后 blog/gallery 的数据不再与旧后端共享。旧后端还要用吗？ |
| 7 | **token 校验** | 两个 save 接口现在完全不校验身份，`userId` 由客户端传，**任何人都能以任意身份发文**。<br>调用方是静态页的原生表单（无 token 字段），所以：<br>① 照搬（继续不校验）<br>② 接 token 校验，**需要改那两个静态页**（加隐藏字段或改成 ajax） |

决策 7 需要改 `static/html/blog/` 下的两个页面，改动量不大但超出了「迁移」范围，
所以单独列出来请您定。

### 人家的建议

| # | 建议 | 理由 |
|---|------|------|
| 1 | 先选 ③ 导出原文检查 | 1.2 MB 的内容值得先看一眼再决定，丢了就没了 |
| 2 | 选 ② 列表不返回正文 | 前端不受影响，只需同步改备份脚本（它本来就该走全量导出） |
| 3 | 选 ① 子表 | 相册图片是独立实体，将来删单张图、统计图片数都是自然需求 |
| 4 | 选 ② 实现真查询 | `auth_user` 表已经有了，`loadRecommandArticles` 用 `ORDER BY time DESC LIMIT 2` 就是一句 SQL |
| 5 | 选 ① 保留 Redis 数据 | 7.73 MB 不占地方，留着能回滚和比对 |
| 6 | — | 取决于您还用不用旧后端 |
| 7 | 选 ② 接 token | 现在是「任何人能以任意身份发文」，和 `save-map` 原来的漏洞同类 |

## 八、本计划不包含的内容

- 文章的编辑与删除接口（现在没有，迁移后才有条件做）
- 全文搜索（SQLite FTS5）
- 图片文件本身的存储（现在存的是外部 URL，不是文件）
