package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.common.RedisKeys;
import com.yumai.entity.VerifyLog;
import com.yumai.repository.VerifyLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 溯源核验：把报告「反伪古风」的核心命题做成在线可用的判定能力。
 *
 * <p>判定口径完全沿用《附录五》P1：命中误传库 → 按伪古风 / 出处讹变 / 出处存疑分级；
 * 命中真典或语料对 → 有据可考；两类同时出现 → 真伪混杂；都没命中 → 未收录（<b>不等于伪古风</b>）。</p>
 *
 * <p>在 P1 之上新增的服务端能力：Redis 结果缓存、判定流水入库（可回溯）、
 * 可信度评分（派生指标，明确标注不是报告数据）、误传案例库检索。</p>
 */
@Service
public class VerifyService {

    private static final int MAX_LEN = 2000;
    private static final int MAX_SEGMENTS = 20;
    private static final int MAX_HITS_PER_SEGMENT = 40;

    private final VerdictBase base;
    private final RedisService redis;
    private final VerifyLogRepository logRepository;

    public VerifyService(VerdictBase base, RedisService redis, VerifyLogRepository logRepository) {
        this.base = base;
        this.redis = redis;
        this.logRepository = logRepository;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> verify(String raw, Long userId) {
        String input = raw == null ? "" : raw.trim();
        if (input.isEmpty()) {
            throw new BizException(400, "请先输入要核验的文案");
        }
        if (input.length() > MAX_LEN) {
            throw new BizException(400, "单次核验不超过 " + MAX_LEN + " 字");
        }

        String cacheKey = RedisKeys.verifyCache(digest(input));
        Object cached = redis.getObject(cacheKey, Object.class);
        Map<String, Object> out;
        boolean hit = false;
        if (cached instanceof Map) {
            out = new LinkedHashMap<>((Map<String, Object>) cached);
            hit = true;
        } else {
            out = analyze(input);
            redis.setObject(cacheKey, out, 3600);
        }
        out.put("cacheHit", hit);

        Map<String, Object> overall = (Map<String, Object>) out.get("overall");
        String verdict = overall == null ? "未收录" : String.valueOf(overall.get("name"));
        Object cred = overall == null ? null : overall.get("credibility");
        Map<String, Object> counts = overall == null ? null : (Map<String, Object>) overall.get("counts");

        redis.hincr(RedisKeys.VERIFY_COUNTER, verdict, 1);

        if (userId != null) {
            VerifyLog log = new VerifyLog();
            log.setUserId(userId);
            log.setInputText(trim(input, 1000));
            log.setVerdict(verdict);
            log.setCredibility(cred instanceof Number ? ((Number) cred).intValue() : null);
            log.setHitCount(counts == null ? 0 : ((Number) counts.get("total")).intValue());
            log.setSuspectCount(counts == null ? 0 : ((Number) counts.get("suspect")).intValue());
            log.setCreatedAt(LocalDateTime.now());
            logRepository.save(log);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> analyze(String input) {
        String[] lines = input.split("\\r?\\n");
        List<String> units = new ArrayList<>();
        boolean batch = false;
        for (String line : lines) {
            String t = line.trim();
            if (t.isEmpty()) {
                continue;
            }
            units.add(t);
        }
        if (units.size() > 1) {
            batch = true;
            if (units.size() > MAX_SEGMENTS) {
                units = new ArrayList<>(units.subList(0, MAX_SEGMENTS));
            }
        }

        List<Map<String, Object>> segments = new ArrayList<>();
        int total = 0;
        int traceable = 0;
        int suspect = 0;
        int modern = 0;
        int fake = 0;
        int corrupt = 0;
        int doubtful = 0;
        int worstOrder = -1;
        String worstLevel = null;
        Set<String> advice = new LinkedHashSet<>();

        int seq = 1;
        for (String unit : units) {
            Map<String, Object> seg = judge(unit);
            seg.put("index", seq++);
            seg.put("text", unit);
            segments.add(seg);

            Map<String, Object> counts = (Map<String, Object>) seg.get("counts");
            total += i(counts.get("total"));
            traceable += i(counts.get("traceable"));
            suspect += i(counts.get("suspect"));
            modern += i(counts.get("modern"));
            fake += i(counts.get("fake"));
            corrupt += i(counts.get("corrupt"));
            doubtful += i(counts.get("doubtful"));

            Map<String, Object> v = (Map<String, Object>) seg.get("verdict");
            int order = i(v.get("order"));
            if (order > worstOrder) {
                worstOrder = order;
                worstLevel = String.valueOf(v.get("name"));
            }
            for (String a : (List<String>) seg.getOrDefault("advice", new ArrayList<String>())) {
                advice.add(a);
            }
        }

        // 总体结论：与单段同口径（有误传又有真句 → 真伪混杂；否则取最严重等级）
        String name;
        int order;
        if (suspect > 0 && traceable > 0) {
            name = "真伪混杂";
            order = 2;
        } else if (suspect > 0) {
            name = worstLevel == null ? "出处存疑" : worstLevel;
            order = 3;
        } else if (traceable > 0) {
            name = "有据可考";
            order = 1;
        } else {
            name = "未收录";
            order = 0;
        }

        Integer credibility = credibility(traceable, fake, corrupt, doubtful, modern, total);
        Map<String, Object> overall = new LinkedHashMap<>();
        overall.put("name", name);
        overall.put("order", order);
        overall.put("credibility", credibility);
        overall.put("credLabel", credLabel(credibility));
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("total", total);
        counts.put("traceable", traceable);
        counts.put("suspect", suspect);
        counts.put("modern", modern);
        counts.put("fake", fake);
        counts.put("corrupt", corrupt);
        counts.put("doubtful", doubtful);
        overall.put("counts", counts);
        overall.put("summary", summaryOf(name, traceable, suspect, modern, segments.size()));
        overall.put("advice", new ArrayList<>(advice));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", batch ? "batch" : "single");
        out.put("inputLength", input.length());
        out.put("segments", segments);
        out.put("overall", overall);
        out.put("indexSize", base.getIndex().size());
        out.put("casesTotal", base.getMisinfo().size());
        out.put("verifiedTotal", base.getVerified().size());
        out.put("disclaimer", "「可信度」是本平台依据误传案例库派生的辅助指标，不是调研报告的统计结果；"
                + "「未收录」只表示未在现有语料中检索到对应条目，不等于伪古风。");
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> judge(String text) {
        List<VerdictBase.Hit> hits = base.detect(text);

        int fake = 0;
        int corrupt = 0;
        int doubtful = 0;
        int good = 0;
        int modern = 0;
        int worstOrder = -1;
        String worstLevel = null;

        List<Map<String, Object>> hitOut = new ArrayList<>();
        Set<String> advice = new LinkedHashSet<>();
        for (VerdictBase.Hit h : hits) {
            VerdictBase.Entry e = h.getEntry();
            if ("modern".equals(e.getKind())) {
                modern++;
            } else if ("misinfo".equals(e.getKind())) {
                if ("伪古风".equals(e.getLevel())) {
                    fake++;
                } else if ("出处讹变".equals(e.getLevel())) {
                    corrupt++;
                } else {
                    doubtful++;
                }
                int o = base.orderOf(e.getLevel());
                if (o > worstOrder) {
                    worstOrder = o;
                    worstLevel = e.getLevel();
                }
                if (e.getAdvice() != null && !e.getAdvice().isEmpty()) {
                    advice.add(e.getAdvice());
                }
            } else {
                good++;
            }
            if (hitOut.size() < MAX_HITS_PER_SEGMENT) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("label", e.getLabel());
                m.put("level", e.getLevel());
                m.put("kind", e.getKind());
                m.put("source", e.getSource());
                m.put("note", e.getNote());
                m.put("advice", e.getAdvice());
                m.put("check", e.getCheck());
                m.put("modern", e.getModern());
                m.put("cats", e.getCats());
                m.put("pos", h.getPos());
                hitOut.add(m);
            }
        }

        int bad = fake + corrupt + doubtful;
        String name;
        int order;
        if (bad > 0 && good > 0) {
            name = "真伪混杂";
            order = 2;
        } else if (bad > 0) {
            name = worstLevel == null ? "出处存疑" : worstLevel;
            order = 3;
        } else if (good > 0) {
            name = "有据可考";
            order = 1;
        } else {
            name = "未收录";
            order = 0;
        }

        if (bad == 0 && good > 0) {
            advice.add("引用时把出处标注到具体篇名，便于他人复核。");
        }
        if (name.equals("未收录")) {
            advice.add("未收录不等于伪古风：可能是生僻典故或当代原创，补上出处再使用更稳妥。");
        }

        Map<String, Object> verdict = new LinkedHashMap<>();
        verdict.put("name", name);
        verdict.put("order", order);
        verdict.put("summary", summaryOf(name, good, bad, modern, 1));

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("total", hits.size());
        counts.put("traceable", good);
        counts.put("suspect", bad);
        counts.put("modern", modern);
        counts.put("fake", fake);
        counts.put("corrupt", corrupt);
        counts.put("doubtful", doubtful);

        Map<String, Object> seg = new LinkedHashMap<>();
        seg.put("verdict", verdict);
        seg.put("counts", counts);
        seg.put("hits", hitOut);
        seg.put("advice", new ArrayList<>(advice));
        return seg;
    }

    private static String summaryOf(String name, int traceable, int suspect, int modern, int segCount) {
        switch (name) {
            case "未收录":
                return "未在已有语料中检索到可对应的词句。这不等于「伪古风」——也可能是生僻典故或现代原创，"
                        + "建议补充出处后再使用。" + (modern > 0 ? " 不过检出 " + modern + " 处现代网络用语，其对应的古风表达见下方。" : "");
            case "有据可考":
                return "检出的词句均能找到出处。引用时请把出处标注到具体篇名。";
            case "真伪混杂":
                return "这段文字里既有可溯源的真句，也有查无出处的拟古句，建议分开处理："
                        + "真句标注出处，拟古句注明「当代创作」。";
            default:
                return "检出" + ("出处讹变".equals(name) ? "字句与原作不符（版本讹变）"
                        : "出处存疑".equals(name) ? "出处归属存疑" : "查无出处的伪古风")
                        + "。请按下方说明修正后再使用。";
        }
    }

    /** 0–100 的派生可信度；未收录时返回 null（无从判断，不硬给分） */
    private static Integer credibility(int traceable, int fake, int corrupt, int doubtful, int modern, int total) {
        if (traceable == 0 && fake + corrupt + doubtful == 0) {
            return null;
        }
        int score = 100 - fake * 35 - corrupt * 22 - doubtful * 12 - modern * 3;
        if (score < 0) {
            score = 0;
        }
        if (traceable == 0 && score > 40) {
            score = 40;
        }
        return score;
    }

    private static String credLabel(Integer score) {
        if (score == null) {
            return "无从判断";
        }
        if (score >= 85) {
            return "可放心引用";
        }
        if (score >= 60) {
            return "需再核一次";
        }
        if (score >= 35) {
            return "风险较高";
        }
        return "高风险·建议改写";
    }

    /** 误传案例库（43 条）检索 */
    public Map<String, Object> cases(String kw, String level, int page, int size) {
        String k = kw == null ? "" : kw.trim();
        String lv = level == null ? "" : level.trim();
        List<Map<String, Object>> list = new ArrayList<>();
        for (VerdictBase.Case c : base.getMisinfo()) {
            if (!lv.isEmpty() && !lv.equals(c.getLevel())) {
                continue;
            }
            if (!k.isEmpty()) {
                String blob = join(c.getPhrase(), c.getWrong(), c.getTruth(), c.getAdvice(), c.getCheck());
                if (!blob.contains(k)) {
                    continue;
                }
            }            Map<String, Object> m = new LinkedHashMap<>();
            m.put("phrase", c.getPhrase());
            m.put("wrong", c.getWrong());
            m.put("truth", c.getTruth());
            m.put("advice", c.getAdvice());
            m.put("level", c.getLevel());
            m.put("check", c.getCheck());
            list.add(m);
        }
        int p = Math.max(1, page);
        int s = Math.min(50, Math.max(1, size));
        int from = (p - 1) * s;
        List<Map<String, Object>> slice = new ArrayList<>();
        for (int i = from; i < list.size() && i < from + s; i++) {
            slice.add(list.get(i));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", slice);
        out.put("total", list.size());
        out.put("page", p);
        out.put("size", s);
        out.put("pages", (list.size() + s - 1) / s);
        out.put("levels", levelCounts());
        out.put("verifiedTotal", base.getVerified().size());
        out.put("indexSize", base.getIndex().size());
        // 关键词在误传库没命中、但在真典库命中时，提示「这是真句」，避免把真句当伪古风
        if (!k.isEmpty()) {
            List<Map<String, Object>> rel = new ArrayList<>();
            for (VerdictBase.Case c : base.getVerified()) {
                String blob = join(c.getText(), c.getSource());
                if (!blob.contains(k)) {
                    continue;
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("text", c.getText());
                m.put("source", c.getSource());
                rel.add(m);
            }
            out.put("relatedVerifiedTotal", rel.size());
            out.put("relatedVerified", rel.subList(0, Math.min(5, rel.size())));
        }
        return out;
    }

    /** 真典库（47 条），按关键词检索 */
    public List<Map<String, Object>> verified(String kw) {
        String k = kw == null ? "" : kw.trim();
        List<Map<String, Object>> list = new ArrayList<>();
        for (VerdictBase.Case c : base.getVerified()) {
            if (!k.isEmpty() && !join(c.getText(), c.getSource()).contains(k)) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("text", c.getText());
            m.put("source", c.getSource());
            list.add(m);
        }
        return list;
    }

    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("casesTotal", base.getMisinfo().size());
        m.put("verifiedTotal", base.getVerified().size());
        m.put("indexSize", base.getIndex().size());
        m.put("levels", levelCounts());
        m.put("verdictCounter", redis.hgetAll(RedisKeys.VERIFY_COUNTER));
        return m;
    }

    public List<Map<String, Object>> history(Long userId, int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (userId == null) {
            return list;
        }
        List<VerifyLog> rows = logRepository.findByUserIdOrderByIdDesc(userId,
                PageRequest.of(0, Math.min(50, Math.max(1, n))));
        for (VerifyLog r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("input", r.getInputText());
            m.put("verdict", r.getVerdict());
            m.put("credibility", r.getCredibility());
            m.put("hitCount", r.getHitCount());
            m.put("suspectCount", r.getSuspectCount());
            m.put("time", r.getCreatedAt() == null ? "" : r.getCreatedAt().toString().replace('T', ' '));
            list.add(m);
        }
        return list;
    }

    private Map<String, Integer> levelCounts() {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (VerdictBase.Case c : base.getMisinfo()) {
            m.merge(c.getLevel(), 1, Integer::sum);
        }
        return m;
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p != null) {
                sb.append(p).append(' ');
            }
        }
        return sb.toString();
    }

    private static int i(Object o) {
        return o instanceof Number ? ((Number) o).intValue() : 0;
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String digest(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 12; i++) {
                sb.append(String.format("%02x", d[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }
}
