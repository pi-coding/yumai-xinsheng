package com.yumai.common;

/**
 * Redis Key 统一管理。全部以 ym: 前缀隔离，便于运维巡检与清理。
 */
public final class RedisKeys {

    private RedisKeys() {
    }

    /** 登录令牌白名单（userId -> token），TTL = access-token-hours */
    public static final String AUTH_TOKEN = "ym:auth:token:";
    /** 刷新令牌（userId -> refreshToken） */
    public static final String AUTH_REFRESH = "ym:auth:refresh:";
    /** 登录失败计数（username -> 次数），用于撞库防护 */
    public static final String AUTH_FAIL = "ym:auth:fail:";

    /** 语料热度 ZSet，member=corpusId，score=热度分 */
    public static final String CORPUS_HOT = "ym:corpus:hot";
    /** 单条语料缓存（JSON），TTL 1h */
    public static final String CORPUS_ITEM = "ym:corpus:item:";
    /** 检索结果缓存，TTL 5min */
    public static final String CORPUS_SEARCH = "ym:corpus:search:";
    /** 分类计数 Hash */
    public static final String CORPUS_CATEGORY = "ym:corpus:category";

    /** 改编结果缓存，TTL 1h */
    public static final String ADAPT_CACHE = "ym:adapt:cache:";
    /** 改编次数统计 Hash（mode -> 次数） */
    public static final String ADAPT_COUNTER = "ym:adapt:counter";

    /** 溯源核验结果缓存，TTL 1h */
    public static final String VERIFY_CACHE = "ym:verify:cache:";
    /** 核验次数统计 Hash（判定结论 -> 次数） */
    public static final String VERIFY_COUNTER = "ym:verify:counter";

    /** 收藏集合（userId -> Set<corpusId>），DB 的 Redis 镜像 */
    public static final String FAV_SET = "ym:fav:set:";

    /** 答题日榜 ZSet（user: {userId} -> score） */
    public static final String QUIZ_RANK = "ym:quiz:rank:";
    /** 答题题库随机池缓存 */
    public static final String QUIZ_POOL = "ym:quiz:pool";

    /** 每日一词（yyyyMMdd） */
    public static final String DAILY_WORD = "ym:daily:";

    /** 日活 UV（HyperLogLog），member=userId 或 ip */
    public static final String STATS_UV = "ym:stats:uv:";
    /** 接口调用 PV 计数 Hash（yyyyMMdd -> Hash<path,count>） */
    public static final String STATS_PV = "ym:stats:pv:";

    /** 限流计数（bucket:identity） */
    public static final String RATE_LIMIT = "ym:rate:";

    public static String corpusItem(Long id) {
        return CORPUS_ITEM + id;
    }

    public static String favSet(Long userId) {
        return FAV_SET + userId;
    }

    public static String quizRank(String day) {
        return QUIZ_RANK + day;
    }

    public static String dailyWord(String day) {
        return DAILY_WORD + day;
    }

    public static String statsUv(String day) {
        return STATS_UV + day;
    }

    public static String statsPv(String day) {
        return STATS_PV + day;
    }

    public static String rateLimit(String bucket, String identity) {
        return RATE_LIMIT + bucket + ":" + identity;
    }

    public static String adaptCache(String hash) {
        return ADAPT_CACHE + hash;
    }

    public static String verifyCache(String hash) {
        return VERIFY_CACHE + hash;
    }

    public static String corpusSearch(String hash) {
        return CORPUS_SEARCH + hash;
    }

    public static String authToken(Long userId) {
        return AUTH_TOKEN + userId;
    }
}
