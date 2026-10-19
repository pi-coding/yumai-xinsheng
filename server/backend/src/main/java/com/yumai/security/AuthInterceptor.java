package com.yumai.security;

import com.yumai.common.BizException;
import com.yumai.service.RedisService;
import io.jsonwebtoken.Claims;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * 登录拦截器：
 * 1) 解析 Bearer Token 并校验签名；
 * 2) 校验 Redis 令牌白名单（退出登录后立即失效）；
 * 3) 把用户写入 UserContext；
 * 4) 对标注 @RequireAuth 的接口做强制校验。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final RedisService redisService;
    private final UserContext userContext;

    public AuthInterceptor(JwtUtil jwtUtil, RedisService redisService, UserContext userContext) {
        this.jwtUtil = jwtUtil;
        this.redisService = redisService;
        this.userContext = userContext;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }
        HandlerMethod hm = (HandlerMethod) handler;
        RequireAuth need = AnnotationUtils.findAnnotation(hm.getMethod(), RequireAuth.class);
        if (need == null) {
            need = AnnotationUtils.findAnnotation(hm.getBeanType(), RequireAuth.class);
        }

        String token = extract(request);
        boolean authenticated = false;
        if (token != null) {
            Claims claims;
            try {
                claims = jwtUtil.parse(token);
            } catch (BizException e) {
                if (need != null) {
                    throw e;
                }
                claims = null;
            }
            if (claims != null && "access".equals(claims.get("type", String.class))) {
                Long uid = Long.valueOf(claims.getSubject());
                String cached = redisService.getToken(uid);
                if (token.equals(cached)) {
                    userContext.set(new LoginUser(uid,
                            claims.get("username", String.class),
                            claims.get("username", String.class),
                            claims.get("role", String.class)));
                    authenticated = true;
                } else if (need != null) {
                    throw BizException.unauthorized("登录状态已失效，请重新登录");
                }
            }
        }

        if (need != null) {
            if (!authenticated) {
                throw BizException.unauthorized("请先登录");
            }
            LoginUser user = userContext.get();
            String[] roles = need.roles();
            if (roles.length > 0) {
                boolean hit = false;
                for (String r : roles) {
                    if (r.equalsIgnoreCase(user.getRole())) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) {
                    throw BizException.forbidden("当前账号无权访问该接口");
                }
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        userContext.clear();
    }

    private String extract(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || header.isEmpty()) {
            String alt = request.getHeader("X-Token");
            return (alt == null || alt.isEmpty()) ? null : alt;
        }
        return header.startsWith("Bearer ") ? header.substring(7).trim() : header.trim();
    }
}
