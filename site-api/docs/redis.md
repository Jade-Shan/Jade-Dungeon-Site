# ioredis vs redis（node-redis）对比

项目中用的是 **`ioredis`**（v5），npm 上还有一个叫 **`redis`** 的包（也叫 node-redis，npm 包名就叫 `redis`）。两者都是 Node.js 的 Redis 客户端，但设计理念和生态有所不同。

---

## 一、基本定位

| | ioredis | redis（node-redis） |
|---|---|---|
| npm 包名 | `ioredis` | `redis` |
| 维护方 | 社区主导（@luin 创建） | Redis 官方团队 |
| 首个版本 | 2015 | 2011（v4 为 2021 重写） |
| TypeScript | 内置类型定义 | 官方内置类型（v4+） |
| Promise | 原生支持（Bluebird 早期） | 原生 Promise（v4+） |

---

## 二、核心差异

### 1. 集群 / Sentinel 支持

这是 **ioredis 最大的优势**。ioredis 内置了对 Redis Cluster、Sentinel、只读副本的原生支持，配置简洁：

```ts
// ioredis — 一行搞定 Cluster
new Redis.Cluster([{ host: 'node1', port: 6379 }]);

// ioredis — Sentinel 也一样简单
new Redis({ sentinels: [...], name: 'mymaster' });
```

而 `redis` 包在 v4 之前对集群支持较弱，v4 后虽已改善，但 API 风格偏底层，需要额外处理槽重定向等细节。

### 2. Lua 脚本 & 命令管道

ioredis 提供了更高级的封装：

```ts
// ioredis: defineCommand 可将 Lua 脚本注册为方法
redis.defineCommand('myScript', { numberOfKeys: 1, lua: '...' });
await redis.myScript('key1');

// ioredis: pipeline 自动将命令排队
const pipeline = redis.pipeline();
pipeline.set('a', 1).get('a');
await pipeline.exec();
```

`redis` 也支持 multi/pipeline，但 ioredis 的链式调用和自动批处理（`autoPipelining`）在吞吐量上更优。

### 3. 连接管理

从项目代码就能看出 ioredis 的灵活之处：

```ts
// src/lib/redis.ts 中用到的 ioredis 特性：
new Redis({
  connectionName: name,      // CLIENT SETNAME
  maxRetriesPerRequest: 3,   // 命令级重试
  retryStrategy(times) {},   // 自定义重连策略
  lazyConnect: true,         // 延迟连接（不立即连）
});
```

- **`lazyConnect`**：构造时不自动连接，等 `connect()` 手动调用。`redis` 默认立即连接，需手动管理。
- **`retryStrategy`**：ioredis 支持按重试次数动态计算延迟，极其灵活。
- **`connectionName`**：ioredis 原生支持 CLIENT SETNAME，调试时可用 `CLIENT LIST` 辨识。

### 4. 事件驱动 & 离线队列

ioredis 在连接断开时会自动将命令放入离线队列，重连后自动发送，业务代码无需关心重连细节。`redis` v4 也支持，但 ioredis 的实现更成熟。

---

## 三、各自的优劣

### ioredis 优势

- 集群/Sentinel 支持最完善，生产环境部署简单
- 连接管理极其灵活（`lazyConnect`、`retryStrategy`、`autoPipelining`）
- 功能齐全：内置 `redis-commands` 支持所有 Redis 命令
- 生态成熟：社区久经考验，网上资料多
- autoPipelining：自动合并并发命令，显著降低往返次数

### ioredis 劣势

- v5 之后维护节奏放缓（创建者 @luin 投入减少）
- 非官方维护，长期路线图不够明确
- 不支持 Redis 7.x 的部分新特性（如 RESP3 协议）

### redis（node-redis v4+）优势

- Redis 官方维护，与 Redis Server 新特性同步最快
- RESP3 支持，减少解析开销
- 模块化设计：可只安装 `@redis/client` + `@redis/json` 等，按需引入
- 官方保证长期支持和安全修复

### redis（node-redis v4+）劣势

- 生态相对较新，网上的历史资料多指向旧版 v3，容易混淆
- 集群 API 不如 ioredis 简洁
- v3 → v4 断崖式升级，老项目迁移成本高

---

## 四、为什么这个项目选 ioredis？

从 `src/lib/redis.ts` 的代码可以反推原因：

1. **`lazyConnect: true`** — 项目希望"连接失败不阻塞服务启动"，ioredis 对这个模式支持最好
2. **`retryStrategy`** — 需要按次数动态退避（最多重试 3 次），ioredis 的回调式 API 最直观
3. **`connectionName`** — 运维需要给连接命名方便排查
4. **项目创建时间** — 如果项目是 2022 年前后启动的，当时 `redis` v4 刚发布不久，生态不如 ioredis 稳定

---

## 五、结论

| 场景 | 推荐 |
|------|------|
| 需要 Cluster / Sentinel / 复杂重连策略 | **ioredis** |
| 新项目、想紧跟 Redis 新版本特性 | **redis（node-redis）** |
| 老项目维护、不想折腾迁移 | 继续用当前的包 |
| 极致性能 + 批量操作 | **ioredis**（autoPipelining） |

对于这个项目来说，当前 ioredis 的选择是合理的，没有迁移的紧迫性。如果是新开项目并且不需要复杂的集群拓扑，可以优先考虑官方的 `redis` 包。
