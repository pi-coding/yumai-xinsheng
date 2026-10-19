package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.common.PageResult;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.FavoriteService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RequireAuth
@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {

    private final FavoriteService favoriteService;
    private final UserContext userContext;

    public FavoriteController(FavoriteService favoriteService, UserContext userContext) {
        this.favoriteService = favoriteService;
        this.userContext = userContext;
    }

    @PostMapping("/{corpusId}")
    public ApiResult<Map<String, Object>> toggle(@PathVariable Long corpusId) {
        Map<String, Object> data = favoriteService.toggle(userContext.requireUserId(), corpusId);
        return ApiResult.ok(Boolean.TRUE.equals(data.get("favorited")) ? "已收藏" : "已取消收藏", data);
    }

    @DeleteMapping("/{corpusId}")
    public ApiResult<Map<String, Object>> remove(@PathVariable Long corpusId) {
        Long uid = userContext.requireUserId();
        Map<String, Object> data;
        if (favoriteService.isFavorited(uid, corpusId)) {
            data = favoriteService.toggle(uid, corpusId);
        } else {
            data = new LinkedHashMap<>();
            data.put("corpusId", corpusId);
            data.put("favorited", false);
            data.put("favCount", favoriteService.count(uid));
        }
        data.put("favorited", false);
        return ApiResult.ok("已取消收藏", data);
    }

    @GetMapping
    public ApiResult<PageResult<Map<String, Object>>> list(@RequestParam(defaultValue = "1") int page,
                                                           @RequestParam(defaultValue = "12") int size) {
        return ApiResult.ok(favoriteService.list(userContext.requireUserId(), page, size));
    }

    @GetMapping("/check/{corpusId}")
    public ApiResult<Map<String, Object>> check(@PathVariable Long corpusId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("corpusId", corpusId);
        m.put("favorited", favoriteService.isFavorited(userContext.requireUserId(), corpusId));
        return ApiResult.ok(m);
    }

    @GetMapping("/count")
    public ApiResult<Map<String, Object>> count() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("count", favoriteService.count(userContext.requireUserId()));
        return ApiResult.ok(m);
    }
}
