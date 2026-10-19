package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.entity.User;
import com.yumai.repository.AdaptLogRepository;
import com.yumai.repository.FavoriteRepository;
import com.yumai.repository.QuizRecordRepository;
import com.yumai.repository.UserRepository;
import com.yumai.security.JwtUtil;
import com.yumai.security.LoginUser;
import io.jsonwebtoken.Claims;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AuthService {

    private static final int MAX_FAIL = 5;

    private final UserRepository userRepository;
    private final FavoriteRepository favoriteRepository;
    private final QuizRecordRepository quizRecordRepository;
    private final AdaptLogRepository adaptLogRepository;
    private final PasswordService passwordService;
    private final JwtUtil jwtUtil;
    private final RedisService redis;

    public AuthService(UserRepository userRepository, FavoriteRepository favoriteRepository,
                       QuizRecordRepository quizRecordRepository, AdaptLogRepository adaptLogRepository,
                       PasswordService passwordService, JwtUtil jwtUtil, RedisService redis) {
        this.userRepository = userRepository;
        this.favoriteRepository = favoriteRepository;
        this.quizRecordRepository = quizRecordRepository;
        this.adaptLogRepository = adaptLogRepository;
        this.passwordService = passwordService;
        this.jwtUtil = jwtUtil;
        this.redis = redis;
    }

    @Transactional
    public Map<String, Object> register(String username, String rawPassword, String nickname) {
        String name = username == null ? "" : username.trim();
        if (name.length() < 3 || name.length() > 20) {
            throw new BizException(400, "账号长度需 3–20 位");
        }
        if (rawPassword == null || rawPassword.length() < 6) {
            throw new BizException(400, "密码至少 6 位");
        }
        if (userRepository.existsByUsername(name)) {
            throw new BizException(409, "该账号已被注册");
        }
        User u = new User();
        u.setUsername(name);
        u.setPassword(passwordService.hash(rawPassword));
        u.setNickname(nickname == null || nickname.trim().isEmpty() ? name : nickname.trim());
        u.setAvatar("avatar-" + (Math.abs(name.hashCode()) % 8));
        u.setRole("USER");
        u.setStatus(1);
        u.setCreatedAt(LocalDateTime.now());
        u.setUpdatedAt(LocalDateTime.now());
        userRepository.save(u);
        return issue(u);
    }

    @Transactional
    public Map<String, Object> login(String username, String rawPassword) {
        String name = username == null ? "" : username.trim();
        User u = userRepository.findByUsername(name)
                .orElseThrow(() -> new BizException(401, "账号或密码不正确"));
        if (u.getStatus() != null && u.getStatus() == 0) {
            throw BizException.forbidden("账号已被禁用");
        }
        if (redis.getLoginFail(name) >= MAX_FAIL) {
            throw new BizException(429, "密码错误次数过多，请 10 分钟后再试");
        }
        if (!passwordService.matches(rawPassword == null ? "" : rawPassword, u.getPassword())) {
            long fails = redis.incrLoginFail(name);
            long left = Math.max(0, MAX_FAIL - fails);
            throw new BizException(401, left > 0
                    ? "账号或密码不正确，还可尝试 " + left + " 次"
                    : "密码错误次数过多，请 10 分钟后再试");
        }
        redis.clearLoginFail(name);
        u.setLastLoginAt(LocalDateTime.now());
        userRepository.save(u);
        return issue(u);
    }

    public void logout(Long userId) {
        if (userId != null) {
            redis.removeToken(userId);
            redis.removeRefresh(userId);
        }
    }

    public Map<String, Object> refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isEmpty()) {
            throw BizException.unauthorized("缺少刷新令牌");
        }
        Claims claims = jwtUtil.parse(refreshToken);
        if (!"refresh".equals(claims.get("type", String.class))) {
            throw BizException.unauthorized("令牌类型不正确");
        }
        Long uid = Long.valueOf(claims.getSubject());
        String stored = redis.getRefresh(uid);
        if (stored == null || !stored.equals(refreshToken)) {
            throw BizException.unauthorized("刷新令牌已失效，请重新登录");
        }
        User u = userRepository.findById(uid).orElseThrow(() -> BizException.unauthorized("账号不存在"));
        String access = jwtUtil.createAccess(u.getId(), u.getUsername(), u.getRole());
        redis.setToken(u.getId(), access, jwtUtil.getAccessMillis());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", access);
        data.put("expiresIn", jwtUtil.getAccessMillis() / 1000);
        return data;
    }

    public Map<String, Object> profile(Long userId) {
        User u = userRepository.findById(userId).orElseThrow(() -> BizException.notFound("用户不存在"));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", u.getId());
        data.put("username", u.getUsername());
        data.put("nickname", u.getNickname());
        data.put("avatar", u.getAvatar());
        data.put("role", u.getRole());
        data.put("createdAt", u.getCreatedAt());
        data.put("lastLoginAt", u.getLastLoginAt());
        data.put("favCount", favoriteRepository.countByUserId(userId));
        data.put("quizCount", quizRecordRepository.countByUserId(userId));
        data.put("adaptCount", adaptLogRepository.countByUserId(userId));
        data.put("bestScore", quizRecordRepository.maxScoreOfUser(userId));
        return data;
    }

    @Transactional
    public Map<String, Object> updateProfile(Long userId, String nickname, String avatar) {
        User u = userRepository.findById(userId).orElseThrow(() -> BizException.notFound("用户不存在"));
        if (nickname != null && !nickname.trim().isEmpty()) {
            if (nickname.trim().length() > 20) {
                throw new BizException(400, "昵称最多 20 字");
            }
            u.setNickname(nickname.trim());
        }
        if (avatar != null && !avatar.trim().isEmpty()) {
            u.setAvatar(avatar.trim());
        }
        u.setUpdatedAt(LocalDateTime.now());
        userRepository.save(u);
        return profile(userId);
    }

    public LoginUser loadLoginUser(Long userId) {
        return userRepository.findById(userId)
                .map(u -> new LoginUser(u.getId(), u.getUsername(), u.getNickname(), u.getRole()))
                .orElse(null);
    }

    private Map<String, Object> issue(User u) {
        String access = jwtUtil.createAccess(u.getId(), u.getUsername(), u.getRole());
        String refresh = jwtUtil.createRefresh(u.getId(), u.getUsername());
        redis.setToken(u.getId(), access, jwtUtil.getAccessMillis());
        redis.setRefresh(u.getId(), refresh, jwtUtil.getRefreshMillis());

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", u.getId());
        user.put("username", u.getUsername());
        user.put("nickname", u.getNickname());
        user.put("avatar", u.getAvatar());
        user.put("role", u.getRole());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("token", access);
        data.put("refreshToken", refresh);
        data.put("expiresIn", jwtUtil.getAccessMillis() / 1000);
        data.put("user", user);
        return data;
    }
}
