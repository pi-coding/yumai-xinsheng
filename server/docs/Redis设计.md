# Redis 设计说明

统一前缀 `ym:`，便于 `SCAN MATCH ym:*` 巡检与整体清理。序列化分两套：

- **StringRedisTemplate**：令牌、计数器、Set、ZSet、Hash、HyperLogLog、Lua 脚本参数
  （脚本里的 `ARGV` 必须是裸字符串，用 JSON 序列化会让 `tonumber()` 失败）；
- **JSON 模板（GenericJackson2JsonRedisSerializer）**：对象/Map 缓存，支持直存直取。

---

## 一、Key 一览

| Key | 类型 | TTL | 写入点 | 读取点 | 用途 |
|---|---|---|---|---|---|
| `ym:auth:token:{userId}` | String | 7 天 | 登录 / 注册 / 刷新 | 鉴权拦截器 | 令牌白名单，退出即删 |
| `ym:auth:refresh:{userId}` | String | 30 天 | 登录 / 注册 | `/auth/refresh` | 刷新令牌校验 |
| `ym:auth:fail:{username}` | String | 10 分钟 | 口令错误时自增 | 登录前检查 | 撞库防护，5 次锁定 |
| `ym:corpus:hot` | ZSet | 常驻 | 语料详情 +2 | 热度榜、看板 | 实时热词排序 |
| `ym:corpus:item:{id}` | String(JSON) | 1 小时 | 预留 | 预留 | 单条语料缓存（写操作会 evict） |
| `ym:corpus:search:{hash}` | String(JSON) | 5 分钟 | 无关键词列表查询 | 同参数查询 | 首页/列表缓存 |
| `ym:adapt:cache:{hash}` | String(JSON) | 1 小时 | 改编计算后 | 改编入口 | 相同参数直接命中，`hitCache=true` |
| `ym:adapt:counter` | Hash | 常驻 | 每次改编 HINCRBY | 看板模式分布 | 今译古 / 古译今 计数 |
| `ym:verify:cache:{sha256[:24]}` | String(JSON) | 1 小时 | 核验计算后 | `/api/verify` | 同一段文案直接命中，`cacheHit=true` |
| `ym:verify:counter` | Hash | 常驻 | 每次核验 HINCRBY | `/api/verify/meta`、首页 | 各结论（伪古风/有据可考/未收录…）累计次数 |
| `ym:fav:set:{userId}` | Set | 常驻 | 收藏 / 取消 | `isFavorited` | 收藏关系镜像（MySQL 为准） |
| `ym:quiz:rank:{yyyyMMdd}` | ZSet | 3 天 | 交卷（仅保留最高分） | 今日榜 | 日榜排名 |
| `ym:daily:{yyyy-MM-dd}` | String(JSON) | 到当日 24 点 | 首次访问生成 | 首页每日一词 | 全站同一词条 |
| `ym:stats:uv:{yyyyMMdd}` | HyperLogLog | 8 天 | 每次 API 调用 | 看板 UV | 去重访客估算，误差 <1% |
| `ym:stats:pv:{yyyyMMdd}` | Hash | 8 天 | 每次 API 调用 | 看板 PV | 字段为归一化后的接口路径 |
| `ym:rate:{r\|w}:{identity}` | String | 60 秒 | Lua 自增 | 限流拦截器 | 固定窗口限流 |

`identity` = 登录用户 `u{id}`；未登录为 `ip{客户端 IP}`。限流在鉴权**之前**执行，避免 401 短路掉计数。

---

## 二、Lua 脚本

**限流（原子）**

```lua
local c = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])   -- 兜住没有过期时间的脏 key
end
return c
```

**热度自增并返回新分值**

```lua
local s = redis.call('ZINCRBY', KEYS[1], ARGV[1], ARGV[2])
return math.floor(tonumber(s))
```

**分布式锁（SET NX PX，预留给收藏去重 / 定时任务）**

```lua
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then return 1 else return 0 end
```

---

## 三、容量与稳定性要点

1. **ZSet 不会无限增长**：热榜 member 只有语料 id（2014 个上限），日榜按天分 key 且 3 天过期。
2. **PV 用 Hash 而非每请求一个 key**：路径先做 `/\d+ → /:id` 归一化，字段数收敛到接口数量级。
3. **UV 用 HyperLogLog**：12KB 固定内存，估算 7 日趋势足够。
4. **缓存穿透**：改编与检索只在「正向结果」时写缓存，空结果不缓存，避免脏空值。
5. **一致性**：收藏、语料写入都会 `evict` 相关缓存；MySQL 是唯一事实来源，Redis 只做加速与统计。
6. **Redis 不可用时**：限流与统计拦截器捕获异常后放行，主流程不因缓存故障中断（`/api/health` 会显示 `redis=DOWN`）。

---

## 四、运维命令

```bash
# 总览
redis-cli dbsize
redis-cli --scan --pattern 'ym:*' | head
redis-cli info stats | findstr keyspace

# 当前限流窗口
redis-cli --scan --pattern 'ym:rate:*'
redis-cli ttl ym:rate:w:ip127.0.0.1

# 今日 UV / PV
redis-cli pfcount ym:stats:uv:20261017
redis-cli hgetall ym:stats:pv:20261017

# 热榜前 10
redis-cli zrevrange ym:corpus:hot 0 9 withscores

# 核验结论分布与缓存条数
redis-cli hgetall ym:verify:counter
redis-cli --scan --pattern 'ym:verify:cache:*' | wc -l

# 清空本平台的 key（谨慎）
redis-cli eval "local ks=redis.call('keys','ym:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0
```

> 注意：本机部分 `redis-cli.exe` 版本不支持 `--scan`，可用 `keys 'ym:rate:*'` 代替（仅调试用，生产避免 `KEYS`）。
