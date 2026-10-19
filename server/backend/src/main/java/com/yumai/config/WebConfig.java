package com.yumai.config;

import com.yumai.security.AuthInterceptor;
import com.yumai.service.ArchiveService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

    /** 前端目录的识别标记：有 index.html 才算一个可用的前端根。 */
    private static final String WEB_MARKER = "index.html";
    /** 外置前端目录的候选名：优先英文名，兼容早期的中文目录名。 */
    private static final String[] FRONTEND_DIR_NAMES = {"frontend", "语脉新生-前端"};
    /** 与 ArchiveService 保持一致：工作目录起最多向上 5 级。 */
    private static final int MAX_UPWARD_LEVELS = 5;

    private final AuthInterceptor authInterceptor;
    private final RateLimitInterceptor rateLimitInterceptor;
    private final StatsInterceptor statsInterceptor;
    private final ArchiveService archiveService;

    @Value("${yumai.web.dir:}")
    private String configuredWebDir;

    public WebConfig(AuthInterceptor authInterceptor, RateLimitInterceptor rateLimitInterceptor,
                     StatsInterceptor statsInterceptor, ArchiveService archiveService) {
        this.authInterceptor = authInterceptor;
        this.rateLimitInterceptor = rateLimitInterceptor;
        this.statsInterceptor = statsInterceptor;
        this.archiveService = archiveService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 限流放在最前：未登录的洪泛请求也要被挡住，此时 identity 为客户端 IP
        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/**")
                .order(1);
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .order(2);
        registry.addInterceptor(statsInterceptor)
                .addPathPatterns("/api/**")
                .order(3);
    }

    /**
     * 两处外部目录映射：
     * <ul>
     *   <li><b>/archive/**</b> → 报告附录五的 18 项离线交付物（原样挂载，链接不用改）；</li>
     *   <li><b>/**</b> → 顶层「frontend」目录，Web 前端与后端分仓存放，改前端不用重打包。</li>
     * </ul>
     * 控制器（/api/**）优先级高于资源处理器，不会被这里的通配映射抢走。
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path archive = archiveService.getRoot();
        if (archive != null) {
            registry.addResourceHandler("/archive/**")
                    .addResourceLocations(archive.toUri().toString())
                    .setCachePeriod(0)
                    .resourceChain(true)
                    .addResolver(new PathResourceResolver());
        }

        Path web = resolveWebDir();
        if (web != null) {
            registry.addResourceHandler("/**")
                    .addResourceLocations(web.toUri().toString(), "classpath:/static/")
                    .setCachePeriod(0)
                    .resourceChain(true)
                    .addResolver(new PathResourceResolver());
        } else {
            registry.addResourceHandler("/**")
                    .addResourceLocations("classpath:/static/")
                    .setCachePeriod(0);
        }
    }

    /**
     * 探测顺序：<code>yumai.web.dir</code> → 从工作目录逐级向上找含 <code>index.html</code> 的
     * 「frontend」→ 退回 jar 内 <code>classpath:/static/</code>。
     */
    private Path resolveWebDir() {
        if (configuredWebDir != null && !configuredWebDir.trim().isEmpty()) {
            Path p = Paths.get(configuredWebDir.trim());
            if (!p.isAbsolute()) {
                p = Paths.get(System.getProperty("user.dir")).resolve(p);
            }
            p = p.toAbsolutePath().normalize();
            if (valid(p)) {
                log.info("前端目录（配置）：{}", p);
                return p;
            }
            log.warn("配置的 yumai.web.dir 无效（缺 {}）：{}", WEB_MARKER, p);
        }
        Path base = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path cursor = base;
        for (int i = 0; i <= MAX_UPWARD_LEVELS && cursor != null; i++) {
            for (String dirName : FRONTEND_DIR_NAMES) {
                Path candidate = cursor.resolve(dirName);
                if (valid(candidate)) {
                    log.info("前端目录（自动探测）：{}", candidate.normalize());
                    return candidate.normalize();
                }
            }
            cursor = cursor.getParent();
        }
        log.warn("未找到「frontend」目录（工作目录 {} 起向上 {} 级），"
                + "将退回 jar 内置静态资源；如需外置请配置 yumai.web.dir。", base, MAX_UPWARD_LEVELS);
        return null;
    }

    private boolean valid(Path p) {
        try {
            return p != null && Files.isDirectory(p) && Files.exists(p.resolve(WEB_MARKER));
        } catch (RuntimeException e) {
            return false;
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
