package com.yumai.config;

import com.yumai.common.RedisKeys;
import com.yumai.security.UserContext;
import com.yumai.service.RedisService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 访问统计：PV 用 Hash 计数、UV 用 HyperLogLog 基数估算（省内存，误差 <1%）。
 */
@Component
public class StatsInterceptor implements HandlerInterceptor {

    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

    private final RedisService redis;
    private final UserContext userContext;

    public StatsInterceptor(RedisService redis, UserContext userContext) {
        this.redis = redis;
        this.userContext = userContext;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/")) {
            return;
        }
        String day = LocalDate.now().format(DAY);
        try {
            redis.hincr(RedisKeys.statsPv(day), normalize(path), 1);
            Long uid = userContext.userId();
            redis.pfAdd(RedisKeys.statsUv(day), uid != null ? "u" + uid : "ip" + RateLimitInterceptor.clientIp(request));
            if (RequestPaths.isUncached(day)) {
                redis.expire(RedisKeys.statsPv(day), 8 * 24 * 3600L);
                redis.expire(RedisKeys.statsUv(day), 8 * 24 * 3600L);
            }
        } catch (Exception ignored) {
            // 统计失败不影响业务
        }
    }

    /** 把 /api/corpus/123 归一化为 /api/corpus/:id，避免 key 爆炸 */
    private String normalize(String path) {
        return path.replaceAll("/\\d+", "/:id");
    }
}
