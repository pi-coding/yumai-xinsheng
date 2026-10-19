package com.yumai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yumai.common.BizException;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriUtils;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 附录五归档托管。
 *
 * <p>设计取舍：不把 29 MB 的静态资产拷进 jar（会让产物体积翻倍、且与源目录产生漂移），
 * 改为「外部目录 + 自动探测」——jar 只带索引（seed/archive.json），文件本体按需从磁盘读。
 * 探测顺序：yumai.archive.dir → 从工作目录逐级向上找「附录五-技术复原」。</p>
 */
@Service
public class ArchiveService {

    /** 用于确认目录确实是附录五根目录的锚点文件 */
    private static final String MARKER = "项目总览.html";
    private static final int MAX_UPWARD_LEVELS = 5;

    private final ObjectMapper mapper;

    @Value("${yumai.archive.dir:}")
    private String configuredDir;

    @Getter
    private Path root;
    @Getter
    private String rootDisplay = "";
    @Getter
    private boolean available;
    private String hint = "";
    private List<Group> groups = new ArrayList<>();

    public ArchiveService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    public void init() {
        this.root = resolveRoot();
        this.available = root != null;
        this.rootDisplay = root == null ? "" : root.toString();
        this.groups = loadGroups();
        enrich();
    }

    // ------------------------------------------------------------------ 目录探测

    private Path resolveRoot() {
        if (configuredDir != null && !configuredDir.trim().isEmpty()) {
            Path p = Paths.get(configuredDir.trim());
            if (!p.isAbsolute()) {
                p = Paths.get(System.getProperty("user.dir")).resolve(p);
            }
            p = p.toAbsolutePath().normalize();
            if (valid(p)) {
                return p;
            }
            hint = "配置的 yumai.archive.dir 无效：" + p;
        }
        Path base = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path cursor = base;
        for (int i = 0; i <= MAX_UPWARD_LEVELS && cursor != null; i++) {
            Path candidate = cursor.resolve("附录五-技术复原");
            if (valid(candidate)) {
                return candidate.normalize();
            }
            cursor = cursor.getParent();
        }
        if (hint.isEmpty()) {
            hint = "未找到「附录五-技术复原」目录（工作目录 " + base + " 起向上 5 级）。"
                    + "可在 application.yml 的 yumai.archive.dir 指定绝对路径。";
        }
        return null;
    }

    private boolean valid(Path p) {
        try {
            return p != null && Files.isDirectory(p) && Files.exists(p.resolve(MARKER));
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ 索引装载

    @SuppressWarnings("unchecked")
    private List<Group> loadGroups() {
        List<Group> list = new ArrayList<>();
        try (InputStream in = new ClassPathResource("seed/archive.json").getInputStream()) {
            Map<String, Object> rootMap = mapper.readValue(in, Map.class);
            List<Map<String, Object>> rawGroups = (List<Map<String, Object>>) rootMap.get("groups");
            for (Map<String, Object> gm : rawGroups) {
                Group g = new Group();
                g.name = str(gm.get("name"));
                g.note = str(gm.get("note"));
                List<Item> items = new ArrayList<>();
                for (Map<String, Object> im : (List<Map<String, Object>>) gm.get("items")) {
                    Item it = new Item();
                    it.id = str(im.get("id"));
                    it.emoji = str(im.get("emoji"));
                    it.name = str(im.get("name"));
                    it.desc = str(im.get("desc"));
                    it.path = str(im.get("path"));
                    it.kind = str(im.get("kind"));
                    it.meta = strList(im.get("meta"));
                    it.tags = strList(im.get("tags"));
                    items.add(it);
                }
                g.items = items;
                list.add(g);
            }
        } catch (Exception e) {
            throw new IllegalStateException("归档索引加载失败：" + e.getMessage(), e);
        }
        return list;
    }

    /** 逐项核对磁盘存在性、体积与文件数 */
    private void enrich() {
        for (Group g : groups) {
            for (Item it : g.items) {
                it.exists = false;
                it.bytes = 0;
                it.files = 0;
                it.url = "/archive/" + UriUtils.encodePath(it.path, StandardCharsets.UTF_8);
                if (root == null) {
                    continue;
                }
                Path p = root.resolve(it.path).normalize();
                if (!p.startsWith(root)) {
                    continue;
                }
                if (!Files.exists(p)) {
                    continue;
                }
                it.exists = true;
                if (Files.isDirectory(p)) {
                    try (Stream<Path> s = Files.walk(p, 6)) {
                        for (Path f : s.collect(Collectors.toList())) {
                            if (Files.isRegularFile(f)) {
                                it.files++;
                                it.bytes += Files.size(f);
                            }
                        }
                    } catch (Exception ignored) {
                        // 单目录不可读不影响整体目录
                    }
                } else {
                    it.files = 1;
                    try {
                        it.bytes = Files.size(p);
                    } catch (Exception ignored) {
                        it.bytes = 0;
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ 对外

    public synchronized Map<String, Object> catalog(boolean refresh) {
        if (refresh) {
            root = resolveRoot();
            available = root != null;
            rootDisplay = root == null ? "" : root.toString();
            enrich();
        }
        int total = 0;
        int missing = 0;
        int files = 0;
        long bytes = 0;
        for (Group g : groups) {
            for (Item it : g.items) {
                total++;
                if (!it.exists) {
                    missing++;
                }
                files += it.files;
                bytes += it.bytes;
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("available", available);
        m.put("root", rootDisplay);
        m.put("hint", available ? "" : hint);
        m.put("totalItems", total);
        m.put("missingItems", missing);
        m.put("indexedFiles", files);
        m.put("indexedBytes", bytes);
        m.put("groups", groups);
        return m;
    }

    public Map<String, Object> stat() {
        Map<String, Object> m = catalog(false);
        Map<String, Object> small = new LinkedHashMap<>();
        small.put("available", m.get("available"));
        small.put("root", m.get("root"));
        small.put("totalItems", m.get("totalItems"));
        small.put("missingItems", m.get("missingItems"));
        small.put("indexedFiles", m.get("indexedFiles"));
        small.put("indexedBytes", m.get("indexedBytes"));
        return small;
    }

    /**
     * 浏览归档内的某个子目录（目录型项目如「复原脚本」「界面截图」没有 index.html，
     * 直接访问会是 404，这里给前端一个可用的清单）。
     */
    public Map<String, Object> listDir(String rel) {
        if (root == null) {
            throw BizException.notFound("归档目录未挂载");
        }
        String r = rel == null ? "" : rel.trim().replace('\\', '/');
        Path dir = r.isEmpty() ? root : root.resolve(r).normalize();
        if (!dir.startsWith(root) || !Files.isDirectory(dir)) {
            throw BizException.notFound("目录不存在：" + rel);
        }
        List<Map<String, Object>> dirs = new ArrayList<>();
        List<Map<String, Object>> files = new ArrayList<>();
        try (Stream<Path> s = Files.list(dir)) {
            for (Path p : s.collect(Collectors.toList())) {
                String name = p.getFileName().toString();
                boolean isDir = Files.isDirectory(p);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", name);
                m.put("dir", isDir);
                String childRel = r.isEmpty() ? name : r + "/" + name;
                m.put("path", childRel);
                m.put("url", "/archive/" + UriUtils.encodePath(childRel, StandardCharsets.UTF_8));
                if (isDir) {
                    int count = 0;
                    try (Stream<Path> w = Files.walk(p, 6)) {
                        count = (int) w.filter(Files::isRegularFile).count();
                    } catch (Exception ignored) {
                        count = 0;
                    }
                    m.put("files", count);
                    dirs.add(m);
                } else {
                    try {
                        m.put("bytes", Files.size(p));
                    } catch (Exception ignored) {
                        m.put("bytes", 0L);
                    }
                    m.put("kind", kindOf(name));
                    files.add(m);
                }
            }
        } catch (Exception e) {
            throw BizException.notFound("目录读取失败：" + e.getMessage());
        }
        dirs.sort((a, b) -> String.valueOf(a.get("name")).compareTo(String.valueOf(b.get("name"))));
        files.sort((a, b) -> String.valueOf(a.get("name")).compareTo(String.valueOf(b.get("name"))));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", r);
        out.put("parent", r.contains("/") ? r.substring(0, r.lastIndexOf('/')) : "");
        out.put("dirs", dirs);
        out.put("files", files);
        out.put("fileCount", files.size());
        out.put("dirCount", dirs.size());
        return out;
    }

    private static String kindOf(String name) {
        String n = name.toLowerCase();
        int dot = n.lastIndexOf('.');
        String ext = dot < 0 ? "" : n.substring(dot + 1);
        switch (ext) {
            case "html":
            case "htm":
                return "html";
            case "md":
                return "md";
            case "json":
                return "json";
            case "txt":
                return "txt";
            case "docx":
            case "doc":
                return "docx";
            case "png":
            case "jpg":
            case "jpeg":
            case "svg":
            case "emf":
                return "image";
            default:
                return "file";
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    @SuppressWarnings("unchecked")
    private static List<String> strList(Object o) {
        List<String> out = new ArrayList<>();
        if (o instanceof List) {
            for (Object x : (List<?>) o) {
                out.add(String.valueOf(x));
            }
        }
        return out;
    }

    @Getter
    public static class Group {
        private String name;
        private String note;
        private List<Item> items;
    }

    @Getter
    public static class Item {
        private String id;
        private String emoji;
        private String name;
        private String desc;
        private String path;
        private String url;
        private String kind;
        private List<String> meta;
        private List<String> tags;
        private boolean exists;
        private long bytes;
        private int files;
    }
}
