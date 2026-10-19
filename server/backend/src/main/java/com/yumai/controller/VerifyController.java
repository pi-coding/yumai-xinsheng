package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.VerifyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 溯源核验：报告「反伪古风」命题的服务端实现。
 * POST 走限流（写桶），结果缓存 1h；登录用户的每次核验会留流水。
 */
@RestController
@RequestMapping("/api/verify")
public class VerifyController {

    private final VerifyService verifyService;
    private final UserContext userContext;

    public VerifyController(VerifyService verifyService, UserContext userContext) {
        this.verifyService = verifyService;
        this.userContext = userContext;
    }

    @PostMapping
    public ApiResult<Map<String, Object>> verify(@RequestBody Map<String, Object> body) {
        String text = body == null ? null : String.valueOf(body.getOrDefault("text", ""));
        return ApiResult.ok(verifyService.verify(text, userContext.userId()));
    }

    @GetMapping("/cases")
    public ApiResult<Map<String, Object>> cases(@RequestParam(required = false) String kw,
                                                @RequestParam(required = false) String level,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return ApiResult.ok(verifyService.cases(kw, level, page, size));
    }

    @GetMapping("/verified")
    public ApiResult<List<Map<String, Object>>> verified(@RequestParam(required = false) String kw) {
        return ApiResult.ok(verifyService.verified(kw));
    }

    @GetMapping("/meta")
    public ApiResult<Map<String, Object>> meta() {
        return ApiResult.ok(verifyService.stats());
    }

    @GetMapping("/history")
    @RequireAuth
    public ApiResult<List<Map<String, Object>>> history(@RequestParam(defaultValue = "10") int n) {
        return ApiResult.ok(verifyService.history(userContext.requireUserId(), n));
    }
}
