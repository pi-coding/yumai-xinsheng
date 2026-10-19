package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.AuthService;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserContext userContext;

    public AuthController(AuthService authService, UserContext userContext) {
        this.authService = authService;
        this.userContext = userContext;
    }

    @PostMapping("/register")
    public ApiResult<Map<String, Object>> register(@Valid @RequestBody RegisterReq req) {
        return ApiResult.ok("注册成功", authService.register(req.getUsername(), req.getPassword(), req.getNickname()));
    }

    @PostMapping("/login")
    public ApiResult<Map<String, Object>> login(@Valid @RequestBody LoginReq req) {
        return ApiResult.ok("登录成功", authService.login(req.getUsername(), req.getPassword()));
    }

    @RequireAuth
    @PostMapping("/logout")
    public ApiResult<Void> logout() {
        authService.logout(userContext.userId());
        return ApiResult.ok();
    }

    @PostMapping("/refresh")
    public ApiResult<Map<String, Object>> refresh(@RequestBody Map<String, String> body) {
        return ApiResult.ok(authService.refresh(body.get("refreshToken")));
    }

    @RequireAuth
    @GetMapping("/me")
    public ApiResult<Map<String, Object>> me() {
        return ApiResult.ok(authService.profile(userContext.requireUserId()));
    }

    @RequireAuth
    @PutMapping("/profile")
    public ApiResult<Map<String, Object>> updateProfile(@RequestBody Map<String, String> body) {
        return ApiResult.ok("资料已更新", authService.updateProfile(userContext.requireUserId(),
                body.get("nickname"), body.get("avatar")));
    }

    public static class RegisterReq {
        @NotBlank(message = "请输入账号")
        @Size(min = 3, max = 20, message = "账号长度需 3–20 位")
        private String username;

        @NotBlank(message = "请输入密码")
        @Size(min = 6, max = 32, message = "密码长度需 6–32 位")
        private String password;

        private String nickname;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getNickname() {
            return nickname;
        }

        public void setNickname(String nickname) {
            this.nickname = nickname;
        }
    }

    public static class LoginReq {
        @NotBlank(message = "请输入账号")
        private String username;

        @NotBlank(message = "请输入密码")
        private String password;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }
}
