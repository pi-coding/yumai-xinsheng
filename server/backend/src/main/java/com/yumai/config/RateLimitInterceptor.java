package com.yumai.config;

import com.yumai.common.BizException;
import com.yumai.security.UserContext;
import com.yumai.service.RedisService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 接口限流：Redis 固定窗口计数（Lua 原子实现）。
 * 读接口 120 次/分钟，写接口 30 次/分钟；已登录用户按 userId 计数，未登录按 IP。
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final long WINDOW_MS = 60_000L;
    private static final int READ_LIMIT = 120;
    private static final int WRITE_LIMIT = 30;

    private final RedisService redis;
    private final UserContext userContext;

    public RateLimitInterceptor(RedisService redis, UserContext userContext) {
        this.redis = redis;
        this.userContext = userContext;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        boolean write = !"GET".equalsIgnoreCase(request.getMethod());
        int limit = write ? WRITE_LIMIT : READ_LIMIT;
        String identity = identity(request);
        String bucket = write ? "w" : "r";
        long count;
        try {
            count = redis.rateLimit(bucket, identity, WINDOW_MS);
        } catch (Exception e) {
            return true; // Redis 不可用时放行，保证主流程可用
        }
        if (count > limit) {
            throw BizException.tooMany("请求过于频繁，请稍后再试（" + limit + " 次/分钟）");
        }
        return true;
    }

    private String identity(HttpServletRequest request) {
        Long uid = userContext.userId();
        return uid != null ? "u" + uid : "ip" + clientIp(request);
    }

    public static String clientIp(HttpServletRequest request) {
        String[] headers = {"X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP"};
        for (String h : headers) {
            String v = request.getHeader(h);
            if (v != null && !v.isEmpty() && !"unknown".equalsIgnoreCase(v)) {
                int comma = v.indexOf(',');
                return comma > 0 ? v.substring(0, comma).trim() : v.trim();
            }
        }
        return request.getRemoteAddr();
    }
}
