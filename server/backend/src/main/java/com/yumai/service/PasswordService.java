package com.yumai.service;

import com.yumai.common.BizException;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 口令摘要：PBKDF2-HMAC-SHA256 + 随机盐，格式 pbkdf2$迭代次数$盐$摘要。
 * 不引入 Spring Security，保持依赖精简。
 */
@Service
public class PasswordService {

    private static final int ITERATIONS = 12000;
    private static final int KEY_LENGTH = 256;
    private static final SecureRandom RANDOM = new SecureRandom();

    public String hash(String raw) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] dk = pbkdf2(raw.toCharArray(), salt, ITERATIONS);
        return "pbkdf2$" + ITERATIONS + "$" + Base64.getEncoder().encodeToString(salt)
                + "$" + Base64.getEncoder().encodeToString(dk);
    }

    public boolean matches(String raw, String stored) {
        if (stored == null || !stored.startsWith("pbkdf2$")) {
            return false;
        }
        String[] parts = stored.split("\\$");
        if (parts.length != 4) {
            return false;
        }
        int iterations = Integer.parseInt(parts[1]);
        byte[] salt = Base64.getDecoder().decode(parts[2]);
        byte[] expect = Base64.getDecoder().decode(parts[3]);
        byte[] actual = pbkdf2(raw.toCharArray(), salt, iterations);
        return java.util.Arrays.equals(expect, actual);
    }

    private byte[] pbkdf2(char[] raw, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(raw, salt, iterations, KEY_LENGTH);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new BizException(500, "口令摘要计算失败");
        }
    }
}
