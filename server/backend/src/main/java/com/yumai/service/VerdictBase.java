package com.yumai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.Setter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 溯源判定索引。与《附录五》P1「古风用语规范助手」的 INDEX 构建逻辑逐条一致：
 * <ol>
 *   <li>误传案例（43 条）+ 其分句；</li>
 *   <li>真典（47 条）+ 其分句；</li>
 *   <li>语料对（118 条）的古风句 + 分句，与误传库重合的跳过（以误传库为准）；</li>
 *   <li>日历词条（16 条）+ 其出处引句；</li>
 *   <li>语料对的现代用语（仅作参考，不参与真伪判定）。</li>
 * </ol>
 * 归一化规则同样照抄：去空白与中英标点后再匹配，因此「无人与我立黄昏，」与「无人与我立黄昏」等价。
 */
@Component
public class VerdictBase {

    /** 与 P1 的 norm 正则完全相同的字符集（去空白 + 去中英标点） */
    private static final String PUNCT = "，。、；：！？\"\"''「」『』（）《》〈〉…—·,.!?;:()[]\"'";

    /** 日历出处里的引号句：与 P1 的 /[“"]([^”"]{6,})[”"]/ 等价 */
    private static final Pattern QUOTED = Pattern.compile("[“\"]([^”\"]{6,})[”\"]");
    private static final Pattern CLAUSE = Pattern.compile("[，、；]");

    private final ObjectMapper mapper;
    private final KnowledgeBase kb;

    @Getter
    private List<Entry> index = new ArrayList<>();
    @Getter
    private List<Case> misinfo = new ArrayList<>();
    @Getter
    private List<Case> verified = new ArrayList<>();
    private Map<String, Integer> levelOrder = new LinkedHashMap<>();

    public VerdictBase(ObjectMapper mapper, KnowledgeBase kb) {
        this.mapper = mapper;
        this.kb = kb;
    }

    @SuppressWarnings("unchecked")
    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("seed/verdict.json").getInputStream()) {
            Map<String, Object> root = mapper.readValue(in, Map.class);
            Map<String, Object> lo = (Map<String, Object>) root.get("levelOrder");
            if (lo != null) {
                for (Map.Entry<String, Object> e : lo.entrySet()) {
                    levelOrder.put(e.getKey(), ((Number) e.getValue()).intValue());
                }
            }
            if (levelOrder.isEmpty()) {
                levelOrder.put("伪古风", 3);
                levelOrder.put("出处讹变", 2);
                levelOrder.put("出处存疑", 1);
                levelOrder.put("有据可考", 0);
                levelOrder.put("现代网语", 0);
            }
            this.misinfo = toCases((List<Map<String, Object>>) root.get("misinfo"));
            this.verified = toCases((List<Map<String, Object>>) root.get("verified"));
        } catch (Exception e) {
            throw new IllegalStateException("判定索引数据加载失败：" + e.getMessage(), e);
        }
        this.index = buildIndex();
    }

    private List<Case> toCases(List<Map<String, Object>> raw) {
        List<Case> list = new ArrayList<>();
        if (raw == null) {
            return list;
        }
        for (Map<String, Object> m : raw) {
            Case c = new Case();
            c.setPhrase(str(m.get("phrase")));
            c.setText(str(m.get("text")));
            c.setWrong(str(m.get("wrong")));
            c.setSource(str(m.get("source")));
            c.setTruth(str(m.get("truth")));
            c.setAdvice(str(m.get("advice")));
            c.setLevel(str(m.get("level")));
            c.setCheck(str(m.get("check")));
            list.add(c);
        }
        return list;
    }

    private List<Entry> buildIndex() {
        List<Entry> idx = new ArrayList<>();

        // 1) 伪古风 / 讹变 / 存疑
        List<String> misKeys = new ArrayList<>();
        for (Case c : misinfo) {
            misKeys.add(norm(c.getPhrase()));
        }
        for (Case c : misinfo) {
            idx.add(entry(norm(c.getPhrase()), c.getPhrase(), c.getLevel(), c.getWrong(),
                    "misinfo", c.getTruth(), c.getAdvice(), c.getCheck(), null, null));
            for (String seg : CLAUSE.split(c.getPhrase())) {
                String s = seg.trim();
                if (norm(s).length() < 5) {
                    continue;
                }
                idx.add(entry(norm(s), s, c.getLevel(), c.getWrong(),
                        "misinfo", c.getTruth(), c.getAdvice(), c.getCheck(), null, null));
            }
        }

        // 2) 真典
        for (Case c : verified) {
            idx.add(entry(norm(c.getText()), c.getText(), "有据可考", c.getSource(),
                    "verified", null, null, null, null, null));
            for (String seg : CLAUSE.split(c.getText())) {
                String s = seg.trim();
                if (norm(s).length() < 5) {
                    continue;
                }
                idx.add(entry(norm(s), s, "有据可考", c.getSource(),
                        "verified", null, null, null, null, null));
            }
        }

        // 3) 语料对（与已知误传重合的跳过，交由误传库判定）
        for (KnowledgeBase.Pair p : kb.getPairs()) {
            String ancient = p.getAncient();
            if (ancient == null || ancient.isEmpty() || inMisinfo(ancient, misKeys)) {
                continue;
            }
            String src = p.getSource() == null || p.getSource().isEmpty() ? "语料库收录" : p.getSource();
            idx.add(entry(norm(ancient), ancient, "有据可考", src, "pair",
                    null, null, null, p.getModern(), p.getCategories()));
            for (String seg : CLAUSE.split(ancient)) {
                String s = seg.trim();
                if (norm(s).length() < 5) {
                    continue;
                }
                idx.add(entry(norm(s), s, "有据可考", src, "pair",
                        null, null, null, p.getModern(), p.getCategories()));
            }
        }

        // 4) 日历词条（含其出处引句）
        for (KnowledgeBase.CalendarEntry c : kb.getCalendar()) {
            idx.add(entry(norm(c.getWord()), c.getWord(), "有据可考", c.getSource(),
                    "calendar", null, null, null, c.getModern(), c.getCategory()));
            Matcher m = QUOTED.matcher(c.getSource() == null ? "" : c.getSource());
            if (m.find()) {
                String t = CLAUSE.split(m.group(1))[0].trim();
                if (!t.isEmpty()) {
                    idx.add(entry(norm(t), t, "有据可考", c.getSource(),
                            "calendar", null, null, null, c.getModern(), c.getCategory()));
                }
            }
        }

        // 5) 现代网络用语 → 古风对应（仅供参考，不参与判定）
        for (KnowledgeBase.Pair p : kb.getPairs()) {
            String modern = p.getModern();
            if (modern == null || modern.isEmpty() || inMisinfo(p.getAncient(), misKeys)) {
                continue;
            }
            idx.add(entry(norm(modern), modern, "现代网语", p.getAncient(), "modern",
                    p.getSource(), null, null, null, null));
        }

        idx.sort(Comparator.comparingInt((Entry e) -> e.getKey().length()).reversed());
        return idx;
    }

    /**
     * 命中检测：长键优先匹配，允许重叠候选后按「位置升序、同位置取更长」去重，
     * 与 P1 的 detect() 完全一致。
     */
    public List<Hit> detect(String text) {
        String n = norm(text);
        List<Hit> raw = new ArrayList<>();
        for (Entry e : index) {
            int min = "modern".equals(e.getKind()) ? 2 : 4;
            if (e.getKey().length() < min) {
                continue;
            }
            int from = 0;
            while (true) {
                int pos = n.indexOf(e.getKey(), from);
                if (pos < 0) {
                    break;
                }
                raw.add(new Hit(pos, e.getKey().length(), e));
                from = pos + 1;
            }
        }
        raw.sort((a, b) -> a.getPos() != b.getPos()
                ? Integer.compare(a.getPos(), b.getPos())
                : Integer.compare(b.getLen(), a.getLen()));
        List<Hit> out = new ArrayList<>();
        int last = -1;
        for (Hit h : raw) {
            if (h.getPos() >= last) {
                out.add(h);
                last = h.getPos() + h.getLen();
            }
        }
        return out;
    }

    /** 语料对古风句是否与已知误传重合（长度 < 4 不参与，避免误伤） */
    public boolean inMisinfo(String s, List<String> misKeys) {
        String n = norm(s);
        if (n.length() < 4) {
            return false;
        }
        for (String k : misKeys) {
            if (k.contains(n) || n.contains(k)) {
                return true;
            }
        }
        return false;
    }

    public int orderOf(String level) {
        Integer v = levelOrder.get(level);
        return v == null ? 0 : v;
    }

    /** 归一化：去空白与中英标点 */
    public static String norm(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c) || PUNCT.indexOf(c) >= 0) {
                continue;
            }
            sb.append(c);
        }
        return sb.toString();
    }

    private static Entry entry(String key, String label, String level, String source, String kind,
                               String note, String advice, String check, String modern, String cats) {
        Entry e = new Entry();
        e.setKey(key);
        e.setLabel(label);
        e.setLevel(level);
        e.setSource(source);
        e.setKind(kind);
        e.setNote(note);
        e.setAdvice(advice);
        e.setCheck(check);
        e.setModern(modern);
        e.setCats(cats);
        return e;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    @Getter
    @Setter
    public static class Entry {
        private String key;
        private String label;
        private String level;
        private String source;
        /** misinfo / verified / pair / calendar / modern */
        private String kind;
        private String note;
        private String advice;
        private String check;
        private String modern;
        private String cats;
    }

    @Getter
    @Setter
    public static class Hit {
        private int pos;
        private int len;
        private Entry entry;

        public Hit(int pos, int len, Entry entry) {
            this.pos = pos;
            this.len = len;
            this.entry = entry;
        }
    }

    @Getter
    @Setter
    public static class Case {
        /** 误传案例的句子 */
        private String phrase;
        /** 真典的句子 */
        private String text;
        /** 常见误标出处 */
        private String wrong;
        /** 真实出处 */
        private String source;
        /** 实际情况说明 */
        private String truth;
        private String advice;
        private String level;
        /** 核验方式：全文核验 / 逐字比对 / 归属查证 / 来源考订 / 体例判断 */
        private String check;

        public String title() {
            return phrase != null && !phrase.isEmpty() ? phrase : text;
        }
    }
}
