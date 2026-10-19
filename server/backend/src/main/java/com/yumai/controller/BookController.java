package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.service.BookService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 古籍书库：补齐 H5 版五大模块中缺失的第 2 个模块（原全栈版只有首页的书架缩略）。
 */
@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @GetMapping
    public ApiResult<Map<String, Object>> list(@RequestParam(required = false) String kw,
                                               @RequestParam(required = false) String bu,
                                               @RequestParam(required = false) String era,
                                               @RequestParam(defaultValue = "1") int page,
                                               @RequestParam(defaultValue = "24") int size) {
        return ApiResult.ok(bookService.list(kw, bu, era, page, size));
    }

    @GetMapping("/random")
    public ApiResult<Map<String, Object>> random() {
        return ApiResult.ok(bookService.random());
    }

    @GetMapping("/{name}")
    public ApiResult<Map<String, Object>> detail(@PathVariable String name) {
        return ApiResult.ok(bookService.detail(name));
    }
}
