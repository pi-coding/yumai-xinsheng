package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.common.PageResult;
import com.yumai.security.UserContext;
import com.yumai.service.CorpusService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/corpus")
public class CorpusController {

    private final CorpusService corpusService;
    private final UserContext userContext;

    public CorpusController(CorpusService corpusService, UserContext userContext) {
        this.corpusService = corpusService;
        this.userContext = userContext;
    }

    @GetMapping
    public ApiResult<PageResult<Map<String, Object>>> search(
            @RequestParam(required = false) String kw,
            @RequestParam(required = false) String category,
            @RequestParam(required = false, defaultValue = "REAL") String dataSource,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(required = false, defaultValue = "default") String sort) {
        return ApiResult.ok(corpusService.search(kw, category, dataSource, page, size, sort, userContext.userId()));
    }

    @GetMapping("/hot")
    public ApiResult<List<Map<String, Object>>> hot(@RequestParam(defaultValue = "8") int n) {
        return ApiResult.ok(corpusService.hot(n));
    }

    @GetMapping("/categories")
    public ApiResult<List<Map<String, Object>>> categories() {
        return ApiResult.ok(corpusService.categories());
    }

    @GetMapping("/{id}")
    public ApiResult<Map<String, Object>> detail(@PathVariable Long id) {
        return ApiResult.ok(corpusService.detail(id, userContext.userId()));
    }
}
