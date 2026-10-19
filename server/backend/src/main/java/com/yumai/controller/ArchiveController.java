package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.service.ArchiveService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 附录五归档：目录索引与状态。文件本体由 WebConfig 里的 /archive/** 静态映射直接输出。
 */
@RestController
@RequestMapping("/api/archive")
public class ArchiveController {

    private final ArchiveService archiveService;

    public ArchiveController(ArchiveService archiveService) {
        this.archiveService = archiveService;
    }

    @GetMapping("/catalog")
    public ApiResult<Map<String, Object>> catalog(@RequestParam(defaultValue = "false") boolean refresh) {
        return ApiResult.ok(archiveService.catalog(refresh));
    }

    @GetMapping("/stat")
    public ApiResult<Map<String, Object>> stat() {
        return ApiResult.ok(archiveService.stat());
    }

    /** 浏览归档子目录（目录型项目没有 index.html，需要清单） */
    @GetMapping("/list")
    public ApiResult<Map<String, Object>> list(@RequestParam(defaultValue = "") String path) {
        return ApiResult.ok(archiveService.listDir(path));
    }
}
