package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.service.DailyWordService;
import com.yumai.service.KnowledgeBase;
import com.yumai.service.RedisService;
import com.yumai.service.VerifyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DailyController {

    private final DailyWordService dailyWordService;
    private final KnowledgeBase kb;
    private final RedisService redis;
    private final VerifyService verifyService;

    public DailyController(DailyWordService dailyWordService, KnowledgeBase kb, RedisService redis,
                           VerifyService verifyService) {
        this.dailyWordService = dailyWordService;
        this.kb = kb;
        this.redis = redis;
        this.verifyService = verifyService;
    }

    @GetMapping("/daily")
    public ApiResult<Map<String, Object>> daily() {
        return ApiResult.ok(dailyWordService.today());
    }

    @GetMapping("/daily/timeline")
    public ApiResult<List<Map<String, Object>>> timeline(@RequestParam(defaultValue = "7") int days) {
        return ApiResult.ok(dailyWordService.timeline(days));
    }

    @GetMapping("/meta")
    public ApiResult<Map<String, Object>> meta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "语脉新生 · 古风网络用语赋能平台");
        m.put("version", "1.0.0");
        m.put("time", LocalDateTime.now().toString());
        m.put("knowledge", kb.stats());
        m.put("books", kb.getBooks());
        m.put("verify", verifyService.stats());
        m.put("redis", redis.ping());
        m.put("dataPolicy", "REAL=报告真实语料，TEMPLATE=按模板生成的扩充语料，界面需明确区分");
        return ApiResult.ok(m);
    }

    @GetMapping("/health")
    public ApiResult<Map<String, Object>> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "UP");
        m.put("redis", redis.ping() ? "UP" : "DOWN");
        m.put("time", LocalDateTime.now().toString());
        return ApiResult.ok(m);
    }
}
