package com.yumai.config;

import com.yumai.common.RedisKeys;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.util.List;

@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        StringRedisSerializer keySerializer = new StringRedisSerializer();
        GenericJackson2JsonRedisSerializer valueSerializer = new GenericJackson2JsonRedisSerializer();
        template.setKeySerializer(keySerializer);
        template.setHashKeySerializer(keySerializer);
        template.setValueSerializer(valueSerializer);
        template.setHashValueSerializer(valueSerializer);
        template.afterPropertiesSet();
        return template;
    }

    /**
     * 固定窗口限流：INCR + 保证有过期时间，返回当前窗口计数（原子操作）。
     * 用 PTTL < 0 兜住「计数器无过期时间」的脏数据，避免永久封禁。
     * KEYS[1]=计数 key，ARGV[1]=窗口毫秒数
     */
    @Bean
    public DefaultRedisScript<Long> rateLimitScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setResultType(Long.class);
        script.setScriptText(
                "local c = redis.call('INCR', KEYS[1]) " +
                "if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end " +
                "return c");
        return script;
    }

    /**
     * 收藏去重锁：SET NX PX，返回 1 表示抢到锁。
     */
    @Bean
    public DefaultRedisScript<Long> setNxScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setResultType(Long.class);
        script.setScriptText(
                "if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then return 1 else return 0 end");
        return script;
    }

    /**
     * 热度累加：ZINCRBY，同时返回新分数。
     */
    @Bean
    public DefaultRedisScript<Long> hotIncrScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setResultType(Long.class);
        script.setScriptText(
                "local s = redis.call('ZINCRBY', KEYS[1], ARGV[1], ARGV[2]) " +
                "return math.floor(tonumber(s))");
        return script;
    }

    public static List<String> rateLimitArgs(long windowMillis) {
        return java.util.Collections.singletonList(String.valueOf(windowMillis));
    }

    public static String hotKey() {
        return RedisKeys.CORPUS_HOT;
    }
}
