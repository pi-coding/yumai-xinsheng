package com.yumai.security;

/**
 * 当前请求的登录用户快照。
 */
public class LoginUser {

    private final Long userId;
    private final String username;
    private final String nickname;
    private final String role;

    public LoginUser(Long userId, String username, String nickname, String role) {
        this.userId = userId;
        this.username = username;
        this.nickname = nickname;
        this.role = role;
    }

    public Long getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public String getNickname() {
        return nickname;
    }

    public String getRole() {
        return role;
    }

    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
