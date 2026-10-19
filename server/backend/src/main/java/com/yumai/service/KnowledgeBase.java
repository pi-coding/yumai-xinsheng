package com.yumai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yumai.common.BizException;
import lombok.Getter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 知识库：从 classpath:seed/knowledge.json 载入
 * 语料对（118 条真实语料）、文言词典（203 + 231）、古籍书目（60 部）、日历词条（16 条）。
 * 全部常驻内存，改编引擎直接读取，避免逐次查库。
 */
@Component
public class KnowledgeBase {

    private final ObjectMapper mapper;

    @Getter
    private List<Pair> pairs = new ArrayList<>();
    @Getter
    private List<Book> books = new ArrayList<>();
    @Getter
    private List<CalendarEntry> calendar = new ArrayList<>();
    /** 现代→文言 词典，按词长倒序，保证最长匹配 */
    private List<String[]> lexM2C = new ArrayList<>();
    private List<String[]> lexC2M = new ArrayList<>();

    public KnowledgeBase(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @SuppressWarnings("unchecked")
    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("seed/knowledge.json").getInputStream()) {
            Map<String, Object> root = mapper.readValue(in, Map.class);
            List<Map<String, Object>> rawPairs = (List<Map<String, Object>>) root.get("pairs");
            List<Pair> ps = new ArrayList<>();
            for (Map<String, Object> m : rawPairs) {
                Pair p = new Pair();
                p.setModern(str(m.get("modern")));
                p.setAncient(str(m.get("ancient")));
                p.setSource(str(m.get("source")));
                p.setCategories(join(m.get("categories")));
                p.setTags(join(m.get("tags")));
                p.setPlatform(str(m.get("platform")));
                p.setSupplement(Boolean.TRUE.equals(m.get("supp")));
                ps.add(p);
            }
            this.pairs = ps;

            Map<String, Object> lexicon = (Map<String, Object>) root.get("lexicon");
            this.lexM2C = toDict((List<List<String>>) lexicon.get("modern2classical"));
            this.lexC2M = toDict((List<List<String>>) lexicon.get("classical2modern"));

            List<Map<String, Object>> rawBooks = (List<Map<String, Object>>) root.get("books");
            List<Book> bs = new ArrayList<>();
            for (Map<String, Object> m : rawBooks) {
                Book b = new Book();
                b.setName(str(m.get("name")));
                b.setBu(str(m.get("bu")));
                b.setEra(str(m.get("era")));
                b.setAuthor(str(m.get("author")));
                b.setIntro(str(m.get("intro")));
                bs.add(b);
            }
            this.books = bs;

            List<Map<String, Object>> rawCal = (List<Map<String, Object>>) root.get("calendar");
            List<CalendarEntry> cal = new ArrayList<>();
            for (Map<String, Object> m : rawCal) {
                CalendarEntry c = new CalendarEntry();
                c.setWord(str(m.get("word")));
                c.setCategory(str(m.get("category")));
                c.setModern(str(m.get("modern")));
                c.setSource(str(m.get("source")));
                c.setGrammar(str(m.get("grammar")));
                c.setUsage(str(m.get("usage")));
                c.setMisuse(str(m.get("misuse")));
                c.setExamples(join(m.get("examples")));
                cal.add(c);
            }
            this.calendar = cal;
        } catch (Exception e) {
            throw new IllegalStateException("知识库加载失败：" + e.getMessage(), e);
        }
    }

    private List<String[]> toDict(List<List<String>> raw) {
        List<String[]> list = new ArrayList<>();
        for (List<String> kv : raw) {
            if (kv.size() < 2) {
                continue;
            }
            list.add(new String[]{kv.get(0), kv.get(1)});
        }
        list.sort(Comparator.comparingInt((String[] a) -> a[0].length()).reversed());
        return list;
    }

    public List<String[]> dictModernToClassical() {
        return lexM2C;
    }

    public List<String[]> dictClassicalToModern() {
        return lexC2M;
    }

    /** 语料对按 modern 长度倒序，供最长匹配掩码使用 */
    public List<Pair> pairsByModernLength() {
        return pairs.stream()
                .filter(p -> p.getModern() != null && !p.getModern().isEmpty())
                .sorted(Comparator.comparingInt((Pair p) -> p.getModern().length()).reversed())
                .collect(Collectors.toList());
    }

    public List<Pair> pairsByAncientLength() {
        return pairs.stream()
                .filter(p -> p.getAncient() != null && !p.getAncient().isEmpty())
                .sorted(Comparator.comparingInt((Pair p) -> p.getAncient().length()).reversed())
                .collect(Collectors.toList());
    }

    public Pair findByModern(String modern) {
        for (Pair p : pairs) {
            if (p.getModern().equals(modern)) {
                return p;
            }
        }
        return null;
    }

    public Map<String, Object> stats() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pairs", pairs.size());
        m.put("supplementPairs", pairs.stream().filter(Pair::isSupplement).count());
        m.put("books", books.size());
        m.put("calendar", calendar.size());
        m.put("lexM2C", lexM2C.size());
        m.put("lexC2M", lexC2M.size());
        return m;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String join(Object o) {
        if (o == null) {
            return "";
        }
        if (o instanceof List) {
            StringBuilder sb = new StringBuilder();
            for (Object x : (List<?>) o) {
                if (sb.length() > 0) {
                    sb.append('、');
                }
                sb.append(x);
            }
            return sb.toString();
        }
        return String.valueOf(o);
    }

    public void requireNotEmpty() {
        if (pairs.isEmpty()) {
            throw new BizException(500, "知识库为空");
        }
    }

    @Getter
    public static class Pair {
        private String modern;
        private String ancient;
        private String source;
        private String categories;
        private String tags;
        private String platform;
        private boolean supplement;

        public void setModern(String modern) {
            this.modern = modern;
        }

        public void setAncient(String ancient) {
            this.ancient = ancient;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public void setCategories(String categories) {
            this.categories = categories;
        }

        public void setTags(String tags) {
            this.tags = tags;
        }

        public void setPlatform(String platform) {
            this.platform = platform;
        }

        public void setSupplement(boolean supplement) {
            this.supplement = supplement;
        }

        public boolean isSupplement() {
            return supplement;
        }
    }

    @Getter
    public static class Book {
        private String name;
        private String bu;
        private String era;
        private String author;
        private String intro;

        public void setName(String name) {
            this.name = name;
        }

        public void setBu(String bu) {
            this.bu = bu;
        }

        public void setEra(String era) {
            this.era = era;
        }

        public void setAuthor(String author) {
            this.author = author;
        }

        public void setIntro(String intro) {
            this.intro = intro;
        }
    }

    @Getter
    public static class CalendarEntry {
        private String word;
        private String category;
        private String modern;
        private String source;
        private String grammar;
        private String usage;
        private String misuse;
        private String examples;

        public void setWord(String word) {
            this.word = word;
        }

        public void setCategory(String category) {
            this.category = category;
        }

        public void setModern(String modern) {
            this.modern = modern;
        }

        public void setSource(String source) {
            this.source = source;
        }

        public void setGrammar(String grammar) {
            this.grammar = grammar;
        }

        public void setUsage(String usage) {
            this.usage = usage;
        }

        public void setMisuse(String misuse) {
            this.misuse = misuse;
        }

        public void setExamples(String examples) {
            this.examples = examples;
        }
    }
}
