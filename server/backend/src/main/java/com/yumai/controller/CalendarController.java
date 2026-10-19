package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.service.CalendarService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 古风科普日历：补齐 H5 版五大模块中缺失的第 5 个模块。
 */
@RestController
@RequestMapping("/api/calendar")
public class CalendarController {

    private final CalendarService calendarService;

    public CalendarController(CalendarService calendarService) {
        this.calendarService = calendarService;
    }

    @GetMapping
    public ApiResult<Map<String, Object>> all() {
        return ApiResult.ok(calendarService.all());
    }
}
