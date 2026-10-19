package com.yumai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 语脉新生 · 古风网络用语赋能中华文脉传承平台
 * 后端启动入口。
 */
@EnableAsync
@SpringBootApplication
public class YuMaiApplication {

    public static void main(String[] args) {
        SpringApplication.run(YuMaiApplication.class, args);
    }
}
