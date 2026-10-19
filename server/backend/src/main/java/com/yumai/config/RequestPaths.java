package com.yumai.config;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 记录当日已设置过过期时间的统计 key，避免每次请求都调 EXPIRE。
 */
final class RequestPaths {

    private static final Set<String> TOUCHED = ConcurrentHashMap.newKeySet();

    private RequestPaths() {
    }

    static boolean isUncached(String day) {
        return TOUCHED.add(day);
    }
}
