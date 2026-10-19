package com.yumai.security;

/**
 * 标记需要登录才能访问的接口（类或方法级）。
 */
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireAuth {

    /** 需要的角色，默认任意已登录用户 */
    String[] roles() default {};
}
