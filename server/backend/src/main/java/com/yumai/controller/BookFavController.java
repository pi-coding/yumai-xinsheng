package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.BookFavService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 古籍收藏（书目级）。全部需要登录——收藏是用户数据，未登录时小程序用本地书架。
 *
 * <ul>
 *   <li>GET  /api/book-favorites              收藏清单（names / items / total）</li>
 *   <li>GET  /api/book-favorites/count        收藏总数</li>
 *   <li>GET  /api/book-favorites/check/{name} 是否已收藏</li>
 *   <li>POST /api/book-favorites/{name}       切换收藏</li>
 *   <li>POST /api/book-favorites/merge        把本地书架批量推到服务端（只加不删）</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/book-favorites")
public class BookFavController {

    private final BookFavService service;
    private final UserContext userContext;

    public BookFavController(BookFavService service, UserContext userContext) {
        this.service = service;
        this.userContext = userContext;
    }

    @RequireAuth
    @GetMapping
    public ApiResult<Map<String, Object>> list() {
        return ApiResult.ok(service.list(userContext.requireUserId()));
    }

    @RequireAuth
    @GetMapping("/count")
    public ApiResult<Map<String, Object>> count() {
        long n = service.count(userContext.requireUserId());
        return ApiResult.ok(Map.of("count", n));
    }

    @RequireAuth
    @GetMapping("/check/{name}")
    public ApiResult<Map<String, Object>> check(@PathVariable String name) {
        boolean fav = service.isFavorited(userContext.requireUserId(), name);
        return ApiResult.ok(Map.of("bookName", name, "favorited", fav));
    }

    @RequireAuth
    @PostMapping("/{name}")
    public ApiResult<Map<String, Object>> toggle(@PathVariable String name) {
        Map<String, Object> data = service.toggle(userContext.requireUserId(), name);
        return ApiResult.ok(Boolean.TRUE.equals(data.get("favorited")) ? "已收藏" : "已取消收藏", data);
    }

    @RequireAuth
    @PostMapping("/merge")
    public ApiResult<Map<String, Object>> merge(@RequestBody Map<String, List<String>> body) {
        return ApiResult.ok("已同步", service.merge(userContext.requireUserId(), body.get("names")));
    }
}
