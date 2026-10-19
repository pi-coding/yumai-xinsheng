package com.yumai.security;

import com.yumai.common.BizException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    private final SecretKey key;
    private final long accessMillis;
    private final long refreshMillis;

    public JwtUtil(@Value("${yumai.jwt.secret}") String secret,
                   @Value("${yumai.jwt.access-token-hours:168}") long accessHours,
                   @Value("${yumai.jwt.refresh-token-days:30}") long refreshDays) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessMillis = accessHours * 3600_000L;
        this.refreshMillis = refreshDays * 24 * 3600_000L;
    }

    public long getAccessMillis() {
        return accessMillis;
    }

    public long getRefreshMillis() {
        return refreshMillis;
    }

    public String createAccess(Long userId, String username, String role) {
        return build(userId, username, role, "access", accessMillis);
    }

    public String createRefresh(Long userId, String username) {
        return build(userId, username, "REFRESH", "refresh", refreshMillis);
    }

    private String build(Long userId, String username, String role, String type, long ttl) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .claim("username", username)
                .claim("role", role)
                .claim("type", type)
                .setIssuedAt(new Date(now))
                .setExpiration(new Date(now + ttl))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public Claims parse(String token) {
        try {
            return Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token).getBody();
        } catch (JwtException | IllegalArgumentException e) {
            throw BizException.unauthorized("登录状态已失效，请重新登录");
        }
    }

    public Long userId(String token) {
        return Long.valueOf(parse(token).getSubject());
    }
}
