package com.yumai.common;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 分页响应体。
 */
public class PageResult<T> {

    private long total;
    private int page;
    private int size;
    private int pages;
    private List<T> list;

    public PageResult() {
    }

    public PageResult(long total, int page, int size, List<T> list) {
        this.total = total;
        this.page = page;
        this.size = size;
        this.pages = size <= 0 ? 0 : (int) Math.ceil(total * 1.0 / size);
        this.list = list;
    }

    public static <E, T> PageResult<T> of(Page<E> src, Function<E, T> mapper) {
        List<T> list = src.getContent().stream().map(mapper).collect(Collectors.toList());
        return new PageResult<>(src.getTotalElements(), src.getNumber() + 1, src.getSize(), list);
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public int getPages() {
        return pages;
    }

    public void setPages(int pages) {
        this.pages = pages;
    }

    public List<T> getList() {
        return list;
    }

    public void setList(List<T> list) {
        this.list = list;
    }
}
