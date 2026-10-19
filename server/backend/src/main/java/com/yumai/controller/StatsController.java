package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.service.StatsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/overview")
    public ApiResult<Map<String, Object>> overview() {
        return ApiResult.ok(statsService.overview());
    }

    @GetMapping("/dashboard")
    public ApiResult<Map<String, Object>> dashboard() {
        return ApiResult.ok(statsService.dashboard());
    }

    @GetMapping("/categories")
    public ApiResult<List<Map<String, Object>>> categories() {
        return ApiResult.ok(statsService.categoryDistribution());
    }

    @GetMapping("/trend")
    public ApiResult<List<Map<String, Object>>> trend() {
        return ApiResult.ok(statsService.trend7d());
    }

    @GetMapping("/hot")
    public ApiResult<List<Map<String, Object>>> hot(@RequestParam(defaultValue = "8") int n) {
        return ApiResult.ok(statsService.hotWords(n));
    }
}
