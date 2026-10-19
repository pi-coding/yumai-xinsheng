package com.yumai.security;

import org.springframework.stereotype.Component;

/**
 * 基于 ThreadLocal 的登录上下文。请求结束由拦截器统一清理，避免线程池串号。
 */
@Component
public class UserContext {

    private static final ThreadLocal<LoginUser> HOLDER = new ThreadLocal<>();

    public void set(LoginUser user) {
        HOLDER.set(user);
    }

    public LoginUser get() {
        return HOLDER.get();
    }

    public Long userId() {
        LoginUser u = HOLDER.get();
        return u == null ? null : u.getUserId();
    }

    public Long requireUserId() {
        Long id = userId();
        if (id == null) {
            throw new IllegalStateException("未登录");
        }
        return id;
    }

    public void clear() {
        HOLDER.remove();
    }
}
