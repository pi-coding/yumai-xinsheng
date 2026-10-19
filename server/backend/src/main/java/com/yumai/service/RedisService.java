package com.yumai.service;

import com.yumai.common.RedisKeys;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Redis 门面。集中封装令牌、缓存、热度、限流、排行榜、UV 统计等能力。
 *
 * 序列化策略：
 *  · 字符串/计数器/集合/脚本 一律走 StringRedisTemplate —— Lua 脚本的 ARGV 必须是裸字符串，
 *    用 JSON 序列化模板会导致 tonumber() 失败；
 *  · 对象缓存走 JSON 模板（GenericJackson2JsonRedisSerializer），支持 Map/POJO 直存直取。
 */
@Service
public class RedisService {

    private final StringRedisTemplate str;
    private final RedisTemplate<String, Object> json;
    private final DefaultRedisScript<Long> rateLimitScript;
    private final DefaultRedisScript<Long> setNxScript;
    private final DefaultRedisScript<Long> hotIncrScript;

    public RedisService(StringRedisTemplate str,
                        RedisTemplate<String, Object> json,
                        DefaultRedisScript<Long> rateLimitScript,
                        DefaultRedisScript<Long> setNxScript,
                        DefaultRedisScript<Long> hotIncrScript) {
        this.str = str;
        this.json = json;
        this.rateLimitScript = rateLimitScript;
        this.setNxScript = setNxScript;
        this.hotIncrScript = hotIncrScript;
    }

    /* ------------------------- 令牌 ------------------------- */

    public void setToken(Long userId, String token, long ttlMillis) {
        str.opsForValue().set(RedisKeys.authToken(userId), token, ttlMillis, TimeUnit.MILLISECONDS);
    }

    public String getToken(Long userId) {
        return str.opsForValue().get(RedisKeys.authToken(userId));
    }

    public void removeToken(Long userId) {
        str.delete(RedisKeys.authToken(userId));
    }

    public void setRefresh(Long userId, String token, long ttlMillis) {
        str.opsForValue().set(RedisKeys.AUTH_REFRESH + userId, token, ttlMillis, TimeUnit.MILLISECONDS);
    }

    public String getRefresh(Long userId) {
        return str.opsForValue().get(RedisKeys.AUTH_REFRESH + userId);
    }

    public void removeRefresh(Long userId) {
        str.delete(RedisKeys.AUTH_REFRESH + userId);
    }

    public long incrLoginFail(String username) {
        String key = RedisKeys.AUTH_FAIL + username;
        Long c = str.opsForValue().increment(key);
        if (c != null && c == 1L) {
            str.expire(key, 10, TimeUnit.MINUTES);
        }
        return c == null ? 0 : c;
    }

    public void clearLoginFail(String username) {
        str.delete(RedisKeys.AUTH_FAIL + username);
    }

    public long getLoginFail(String username) {
        String v = str.opsForValue().get(RedisKeys.AUTH_FAIL + username);
        if (v == null) {
            return 0;
        }
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /* ------------------------- 对象缓存 ------------------------- */

    public <T> T getObject(String key, Class<T> type) {
        Object v = json.opsForValue().get(key);
        return type.isInstance(v) ? type.cast(v) : null;
    }

    public void setObject(String key, Object value, long ttlSeconds) {
        json.opsForValue().set(key, value, ttlSeconds, TimeUnit.SECONDS);
    }

    public void evict(String key) {
        str.delete(key);
        json.delete(key);
    }

    public void evictPrefix(String prefix) {
        Set<String> keys = str.keys(prefix + "*");
        if (keys != null && !keys.isEmpty()) {
            str.delete(keys);
        }
    }

    /* ------------------------- 热度 ------------------------- */

    public long hotIncr(Long corpusId, int delta) {
        Long v = str.execute(hotIncrScript, Collections.singletonList(RedisKeys.CORPUS_HOT),
                String.valueOf(delta), String.valueOf(corpusId));
        return v == null ? 0 : v;
    }

    /** 返回 [corpusId, score] 列表，按热度倒序 */
    public List<long[]> hotTop(int n) {
        Set<ZSetOperations.TypedTuple<String>> tuples =
                str.opsForZSet().reverseRangeWithScores(RedisKeys.CORPUS_HOT, 0, Math.max(0, n - 1));
        List<long[]> result = new ArrayList<>();
        if (tuples == null) {
            return result;
        }
        for (ZSetOperations.TypedTuple<String> t : tuples) {
            if (t.getValue() == null) {
                continue;
            }
            result.add(new long[]{parseId(t.getValue()),
                    t.getScore() == null ? 0 : t.getScore().longValue()});
        }
        return result;
    }

    /** 容忍历史脏数据（早期版本以 JSON 字符串写入 ZSet member，带引号） */
    private static long parseId(String raw) {
        if (raw == null) {
            return -1L;
        }
        String s = raw.replace("\"", "").trim();
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    public Double hotScore(Long corpusId) {
        Double s = str.opsForZSet().score(RedisKeys.CORPUS_HOT, String.valueOf(corpusId));
        return s == null ? 0D : s;
    }

    /* ------------------------- 收藏集合 ------------------------- */

    public void favAdd(Long userId, Long corpusId) {
        str.opsForSet().add(RedisKeys.favSet(userId), String.valueOf(corpusId));
    }

    public void favRemove(Long userId, Long corpusId) {
        str.opsForSet().remove(RedisKeys.favSet(userId), String.valueOf(corpusId));
    }

    public Set<String> favAll(Long userId) {
        Set<String> s = str.opsForSet().members(RedisKeys.favSet(userId));
        return s == null ? Collections.emptySet() : s;
    }

    public boolean favContains(Long userId, Long corpusId) {
        Boolean b = str.opsForSet().isMember(RedisKeys.favSet(userId), String.valueOf(corpusId));
        return Boolean.TRUE.equals(b);
    }

    /* ------------------------- 限流 / 锁 ------------------------- */

    /** 固定窗口限流，返回当前窗口内计数 */
    public long rateLimit(String bucket, String identity, long windowMillis) {
        Long c = str.execute(rateLimitScript,
                Collections.singletonList(RedisKeys.rateLimit(bucket, identity)),
                String.valueOf(windowMillis));
        return c == null ? 0 : c;
    }

    public boolean setNx(String key, String value, long ttlMillis) {
        Long ok = str.execute(setNxScript, Collections.singletonList(key), value, String.valueOf(ttlMillis));
        return ok != null && ok == 1L;
    }

    /* ------------------------- 计数器 / 排行榜 / UV ------------------------- */

    public void hincr(String key, String field, long delta) {
        str.opsForHash().increment(key, field, delta);
    }

    public Map<String, String> hgetAll(String key) {
        Map<Object, Object> raw = str.opsForHash().entries(key);
        Map<String, String> out = new java.util.LinkedHashMap<>();
        raw.forEach((k, v) -> out.put(String.valueOf(k), String.valueOf(v)));
        return out;
    }

    public void zadd(String key, String member, double score) {
        str.opsForZSet().add(key, member, score);
    }

    public List<ZSetOperations.TypedTuple<String>> zrevrange(String key, int n) {
        Set<ZSetOperations.TypedTuple<String>> set =
                str.opsForZSet().reverseRangeWithScores(key, 0, Math.max(0, n - 1));
        return set == null ? Collections.emptyList() : new ArrayList<>(set);
    }

    public Long zrankRev(String key, String member) {
        return str.opsForZSet().reverseRank(key, member);
    }

    public Double zscore(String key, String member) {
        return str.opsForZSet().score(key, member);
    }

    public void pfAdd(String key, String... values) {
        str.opsForHyperLogLog().add(key, values);
    }

    public long pfCount(String key) {
        Long c = str.opsForHyperLogLog().size(key);
        return c == null ? 0 : c;
    }

    public void expire(String key, long seconds) {
        str.expire(key, seconds, TimeUnit.SECONDS);
    }

    public boolean ping() {
        try (org.springframework.data.redis.connection.RedisConnection conn =
                     str.getConnectionFactory().getConnection()) {
            // Spring Data Redis 的 RedisConnection#ping() 直接返回字符串 "PONG"
            String pong = conn.ping();
            return pong != null && "PONG".equalsIgnoreCase(pong);
        } catch (Exception e) {
            return false;
        }
    }

    /** 当前库 key 数量，供运维巡检 */
    public long dbSize() {
        Long size = str.execute((RedisCallback<Long>) c -> c.dbSize());
        return size == null ? 0 : size;
    }

    public Collection<String> keys(String pattern) {
        Set<String> keys = str.keys(pattern);
        return keys == null ? Collections.emptyList() : keys;
    }
}
