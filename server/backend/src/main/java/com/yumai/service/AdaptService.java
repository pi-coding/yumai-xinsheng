package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.entity.AdaptLog;
import com.yumai.repository.AdaptLogRepository;
import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 语言改编引擎（服务端移植版）。
 * 算法与《附录五》H5 版 localAdapt 逐条一致：
 * 1) 语料对最长匹配 + 掩码保护；2) 词典单次扫描替换（结果不再被扫）；3) 句法变换；4) 还原掩码；
 * 5) 语境前缀与语气尾缀。
 */
@Service
public class AdaptService {

    private static final String MASK = "\u0001";
    private static final Pattern UNMASK = Pattern.compile("\u0001(\\d+)\u0001");

    private static final Map<String, String> CTX_PREFIX = new LinkedHashMap<>();
    private static final Map<String, String> TONE_HEAD = new LinkedHashMap<>();
    private static final Map<String, String> TONE_TAIL = new LinkedHashMap<>();

    static {
        CTX_PREFIX.put("日常", "");
        CTX_PREFIX.put("职场", "案牍之间，");
        CTX_PREFIX.put("学习", "青灯之下，");
        CTX_PREFIX.put("情感", "心事如潮，");
        CTX_PREFIX.put("社交", "宾主之间，");

        TONE_HEAD.put("自然", "");
        TONE_HEAD.put("俏皮", "咦，");
        TONE_HEAD.put("庄重", "夫");
        TONE_HEAD.put("深情", "嗟乎，");
        TONE_HEAD.put("豪迈", "壮哉！");
        TONE_HEAD.put("温婉", "悄然");

        TONE_TAIL.put("自然", "");
        TONE_TAIL.put("俏皮", "，亦是快事");
        TONE_TAIL.put("庄重", "，斯为雅正");
        TONE_TAIL.put("深情", "，此情难已");
        TONE_TAIL.put("豪迈", "，壮哉");
        TONE_TAIL.put("温婉", "，聊寄幽怀");
    }

    private final KnowledgeBase kb;
    private final RedisService redis;
    private final AdaptLogRepository logRepository;

    public AdaptService(KnowledgeBase kb, RedisService redis, AdaptLogRepository logRepository) {
        this.kb = kb;
        this.redis = redis;
        this.logRepository = logRepository;
    }

    /** 带 Redis 缓存与流水的改编入口 */
    public Map<String, Object> adaptCached(String text, String mode, String ctx, String tone, String form, Long userId) {
        String input = text == null ? "" : text.trim();
        if (input.isEmpty()) {
            throw new BizException(400, "请先输入要改编的内容");
        }
        if (input.length() > 300) {
            throw new BizException(400, "单次改编不超过 300 字");
        }
        String normalizedMode = "c2m".equals(mode) ? "c2m" : "m2c";
        String normalizedCtx = CTX_PREFIX.containsKey(ctx) ? ctx : "日常";
        String normalizedTone = TONE_HEAD.containsKey(tone) ? tone : "自然";
        String normalizedForm = normalizeForm(normalizedMode, form);

        String cacheKey = digest(normalizedMode + "|" + normalizedCtx + "|" + normalizedTone + "|"
                + normalizedForm + "|" + input);
        Object cached = redis.getObject(com.yumai.common.RedisKeys.adaptCache(cacheKey), Object.class);

        AdaptResult result;
        Map<String, Object> out = new LinkedHashMap<>();
        boolean hit = false;
        if (cached instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> c = (Map<String, Object>) cached;
            out.putAll(c);
            hit = true;
            result = new AdaptResult();
            result.setOutput(str(c.get("output")));
            result.setSource(str(c.get("source")));
            result.setNotes(null);
            result.setMatchedCode(null);
        } else {
            result = adapt(input, normalizedMode, normalizedCtx, normalizedTone, normalizedForm);
            out.put("input", input);
            out.put("output", result.getOutput());
            out.put("source", result.getSource());
            out.put("notes", result.getNotes());
            out.put("traces", result.getTraces());
            out.put("mode", normalizedMode);
            out.put("context", normalizedCtx);
            out.put("tone", normalizedTone);
            out.put("form", normalizedForm);
            out.put("hitCache", false);
            redis.setObject(com.yumai.common.RedisKeys.adaptCache(cacheKey), out, 3600);
        }
        out.put("hitCache", hit);
        // 老版本缓存里没有 traces，补一个空列表，前端不必判空
        out.putIfAbsent("traces", new ArrayList<>());

        AdaptLog log = new AdaptLog();
        log.setUserId(userId);
        log.setInputText(trim(input, 1000));
        log.setOutputText(trim(result.getOutput(), 1000));
        log.setMode(normalizedMode);
        log.setContext(normalizedCtx);
        log.setTone(normalizedTone);
        log.setForm(normalizedForm);
        log.setMatchedCode(result.getMatchedCode());
        log.setHitCache(hit ? 1 : 0);
        log.setCreatedAt(LocalDateTime.now());
        logRepository.save(log);

        redis.hincr(com.yumai.common.RedisKeys.ADAPT_COUNTER, normalizedMode, 1);
        redis.pfAdd(com.yumai.common.RedisKeys.statsUv(java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)),
                userId != null ? "u" + userId : "anon-" + System.nanoTime());
        return out;
    }

    /** 纯算法，不依赖 Redis / DB，便于单测与批量回归 */
    public AdaptResult adapt(String text, String mode, String ctx, String tone, String form) {
        List<String> notes = new ArrayList<>();
        List<String> store = new ArrayList<>();
        List<Map<String, Object>> traces = new ArrayList<>();
        String out = text;
        String source = "";
        String matchedCode = null;

        if ("m2c".equals(mode)) {
            MaskResult mk = maskPairs(text, true, store, traces);
            out = mk.text;
            if (mk.used != null) {
                source = mk.used.getSource() == null ? "" : mk.used.getSource();
                notes.add((mk.used.isSupplement() ? "命中补充语料条目" : "命中语料库条目")
                        + "：「" + mk.used.getModern() + "」→「" + mk.used.getAncient() + "」");
            }
            LexResult r = applyLex(out, kb.dictModernToClassical(), traces, "文言词表替换");
            out = r.text;
            if (r.count > 0) {
                notes.add("文言词汇替换 " + r.count + " 处");
            }
            switch (form) {
                case "文言句式":
                    out = classicalSyntax(out, traces);
                    notes.add("套用文言句式（将字句／为…所／之字结构）");
                    break;
                case "诗词语素拼接":
                    out = replaceCount(out, "的", "之", traces, "「的」缀作「之」");
                    out = replaceCount(out, "了", "矣", traces, "「了」缀作「矣」");
                    notes.add("诗词语素拼接：以「之」「矣」缀合语素");
                    break;
                case "网络改编":
                    out = replaceAllCount(out, "[啊呀哦嘛]", "", traces, "删去语气助词「啊／呀／哦／嘛」");
                    notes.add("网络改编：保留原意骨架，套以浅近文言");
                    break;
                default:
                    notes.add("原词使用：仅做词汇层替换，不改动原句结构");
            }
            out = unmask(out, store);
        } else {
            MaskResult mk = maskPairs(text, false, store, traces);
            out = mk.text;
            if (mk.used != null) {
                source = mk.used.getSource() == null ? "" : mk.used.getSource();
                notes.add((mk.used.isSupplement() ? "命中补充语料条目" : "命中语料库条目")
                        + "：「" + mk.used.getAncient() + "」→「" + mk.used.getModern() + "」");
            }
            LexResult r = applyLex(out, kb.dictClassicalToModern(), traces, "白话词表还原");
            out = r.text;
            if (r.count > 0) {
                notes.add("白话词汇还原 " + r.count + " 处");
            }
            out = modernSyntax(out, traces);
            switch (form) {
                case "网络改编":
                    out = out + "（笑）";
                    traces.add(trace(traces.size() + 1, "style", "网络语气标记", "句末补入「（笑）」", null, 1));
                    notes.add("网络改编：补入网络语气标记");
                    break;
                case "文言句式":
                    notes.add("保留原文语序，仅做词面转写");
                    break;
                default:
                    notes.add("通俗转写：按常用白话词表逐词还原");
            }
            out = unmask(out, store);
        }

        String pre = CTX_PREFIX.getOrDefault(ctx, "");
        String head = TONE_HEAD.getOrDefault(tone, "");
        String tail = TONE_TAIL.getOrDefault(tone, "");
        if (!pre.isEmpty()) {
            out = pre + out;
            traces.add(trace(traces.size() + 1, "context", "语境限定", "句首加「" + pre + "」", ctx, 1));
            notes.add("语境限定：" + ctx + "（前缀「" + pre + "」）");
        }
        if (!head.isEmpty()) {
            out = head + out;
            traces.add(trace(traces.size() + 1, "tone", "语气起句", "句首加「" + head + "」", tone, 1));
        }
        if (!tail.isEmpty()) {
            out = out.replaceAll("[，。,.]$", "") + tail;
            traces.add(trace(traces.size() + 1, "tone", "语气收束", "句尾加「" + tail + "」", tone, 1));
            notes.add("语气修饰：" + tone);
        }
        if (!source.isEmpty()) {
            notes.add("出处：" + source);
        }

        AdaptResult result = new AdaptResult();
        result.setOutput(out);
        result.setSource(source);
        result.setNotes(notes);
        result.setMatchedCode(matchedCode);
        result.setTraces(traces);
        return result;
    }

    private static Map<String, Object> trace(int step, String type, String title, String detail,
                                             String source, int count) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("step", step);
        m.put("type", type);
        m.put("title", title);
        m.put("detail", detail);
        m.put("source", source);
        m.put("count", count);
        return m;
    }

    /* ---------------- 内部工具 ---------------- */

    private static final class MaskResult {
        private String text;
        private KnowledgeBase.Pair used;
    }

    private static final class LexResult {
        private String text;
        private int count;
    }

    private MaskResult maskPairs(String text, boolean byModern, List<String> store) {
        return maskPairs(text, byModern, store, null);
    }

    private MaskResult maskPairs(String text, boolean byModern, List<String> store,
                                List<Map<String, Object>> traces) {
        List<KnowledgeBase.Pair> items = byModern ? kb.pairsByModernLength() : kb.pairsByAncientLength();
        MaskResult res = new MaskResult();
        res.text = text;
        if (items.isEmpty()) {
            return res;
        }
        StringBuilder sb = new StringBuilder();
        for (KnowledgeBase.Pair p : items) {
            String key = byModern ? p.getModern() : p.getAncient();
            if (key == null || key.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('|');
            }
            sb.append(Pattern.quote(key));
        }
        final KnowledgeBase.Pair[] used = new KnowledgeBase.Pair[1];
        Pattern pattern = Pattern.compile(sb.toString(), Pattern.MULTILINE);
        Matcher m = pattern.matcher(text);
        StringBuffer out = new StringBuffer();
        while (m.find()) {
            KnowledgeBase.Pair p = byModern ? kb.findByModern(m.group()) : findByAncient(m.group());
            if (p == null) {
                continue;
            }
            if (used[0] == null) {
                used[0] = p;
            }
            store.add(byModern ? p.getAncient() : p.getModern());
            if (traces != null) {
                String from = byModern ? p.getModern() : p.getAncient();
                String to = byModern ? p.getAncient() : p.getModern();
                traces.add(trace(traces.size() + 1, "corpus", "语料对命中",
                        "「" + from + "」→「" + to + "」",
                        p.getSource(),
                        1));
            }
            m.appendReplacement(out, Matcher.quoteReplacement(MASK + (store.size() - 1) + MASK));
        }
        m.appendTail(out);
        res.text = out.toString();
        res.used = used[0];
        return res;
    }

    private KnowledgeBase.Pair findByAncient(String ancient) {
        for (KnowledgeBase.Pair p : kb.getPairs()) {
            if (ancient.equals(p.getAncient())) {
                return p;
            }
        }
        return null;
    }

    private LexResult applyLex(String text, List<String[]> dict) {
        return applyLex(text, dict, null, null);
    }

    private LexResult applyLex(String text, List<String[]> dict,
                               List<Map<String, Object>> traces, String label) {
        LexResult res = new LexResult();
        res.text = text;
        if (dict.isEmpty()) {
            return res;
        }
        StringBuilder sb = new StringBuilder();
        Map<String, String> map = new LinkedHashMap<>();
        for (String[] kv : dict) {
            if (kv[0] == null || kv[0].isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('|');
            }
            sb.append(Pattern.quote(kv[0]));
            map.putIfAbsent(kv[0], kv[1]);
        }
        Pattern pattern = Pattern.compile(sb.toString());
        Matcher m = pattern.matcher(text);
        StringBuffer out = new StringBuffer();
        int count = 0;
        Map<String, Integer> applied = new LinkedHashMap<>();
        while (m.find()) {
            String rep = map.get(m.group());
            m.appendReplacement(out, Matcher.quoteReplacement(rep == null ? "" : rep));
            count++;
            applied.merge(m.group() + "→" + (rep == null ? "" : rep), 1, Integer::sum);
        }
        m.appendTail(out);
        res.text = out.toString();
        res.count = count;
        if (traces != null && !applied.isEmpty()) {
            StringBuilder detail = new StringBuilder();
            int shown = 0;
            for (Map.Entry<String, Integer> e : applied.entrySet()) {
                if (shown++ >= 8) {
                    detail.append(" 等");
                    break;
                }
                if (detail.length() > 0) {
                    detail.append("、");
                }
                detail.append("「").append(e.getKey().replace("→", "」→「")).append("」");
                if (e.getValue() > 1) {
                    detail.append("×").append(e.getValue());
                }
            }
            traces.add(trace(traces.size() + 1, "lexicon",
                    label == null ? "词表替换" : label,
                    detail.toString() + "（共 " + count + " 处）", null, count));
        }
        return res;
    }

    /** 字面替换并记录命中次数 */
    private static String replaceCount(String s, String from, String to,
                                       List<Map<String, Object>> traces, String label) {
        if (s == null || from.isEmpty() || !s.contains(from)) {
            return s;
        }
        int c = 0;
        int idx = 0;
        StringBuilder sb = new StringBuilder();
        while (true) {
            int p = s.indexOf(from, idx);
            if (p < 0) {
                sb.append(s, idx, s.length());
                break;
            }
            sb.append(s, idx, p).append(to);
            c++;
            idx = p + from.length();
        }
        if (traces != null && c > 0) {
            traces.add(trace(traces.size() + 1, "syntax", "字词订正",
                    label + "（" + c + " 处）", null, c));
        }
        return sb.toString();
    }

    /** 正则替换并记录命中次数（语义等同 String.replaceAll） */
    private static String replaceAllCount(String s, String regex, String repl,
                                          List<Map<String, Object>> traces, String label) {
        Matcher m = Pattern.compile(regex).matcher(s);
        int c = 0;
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            c++;
            m.appendReplacement(sb, repl);
        }
        m.appendTail(sb);
        if (traces != null && c > 0) {
            traces.add(trace(traces.size() + 1, "syntax", "句式变换",
                    label + "（" + c + " 处）", null, c));
        }
        return sb.toString();
    }

    private String unmask(String text, List<String> store) {
        Matcher m = UNMASK.matcher(text);
        StringBuffer out = new StringBuffer();
        while (m.find()) {
            int idx = Integer.parseInt(m.group(1));
            String v = (idx >= 0 && idx < store.size()) ? store.get(idx) : "";
            m.appendReplacement(out, Matcher.quoteReplacement(v));
        }
        m.appendTail(out);
        return out.toString();
    }

    private String classicalSyntax(String s) {
        return classicalSyntax(s, null);
    }

    private String classicalSyntax(String s, List<Map<String, Object>> traces) {
        String o = s;
        o = replaceAllCount(o, "把(.{1,6})当作", "以$1为", traces, "「把…当作」→「以…为」");
        o = replaceCount(o, "把", "将", traces, "「把」→「将」");
        o = replaceAllCount(o, "被(.{1,6})了", "为$1所", traces, "「被…了」→「为…所」");
        o = replaceCount(o, "的时候", "之时", traces, "「的时候」→「之时」");
        o = replaceCount(o, "的地方", "之处", traces, "「的地方」→「之处」");
        o = replaceCount(o, "的原因", "之由", traces, "「的原因」→「之由」");
        return o;
    }

    private String modernSyntax(String s) {
        return modernSyntax(s, null);
    }

    private String modernSyntax(String s, List<Map<String, Object>> traces) {
        String o = s;
        o = replaceAllCount(o, "以(.{1,6})为", "把$1当作", traces, "「以…为」→「把…当作」");
        o = replaceAllCount(o, "为(.{1,6})所", "被$1", traces, "「为…所」→「被…」");
        o = replaceAllCount(o, "之(时|处|由)", "的时候", traces, "「之×」→「的时候」");
        return o;
    }

    private static String normalizeForm(String mode, String form) {
        String[] m2c = {"原词使用", "诗词语素拼接", "网络改编", "文言句式"};
        for (String f : m2c) {
            if (f.equals(form)) {
                return form;
            }
        }
        return "m2c".equals(mode) ? "原词使用" : "通俗转写";
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

    private static String trim(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    @Getter
    @Setter
    public static class AdaptResult implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        private String output;
        private String source;
        private List<String> notes;
        private String matchedCode;
        /** 改写依据链：每处改动的类型、内容、出处与次数 */
        private List<Map<String, Object>> traces;
    }
}
