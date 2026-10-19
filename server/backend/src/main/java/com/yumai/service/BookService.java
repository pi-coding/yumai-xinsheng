package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.entity.Corpus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 古籍书库。60 部书目的元数据全部来自知识库（seed/knowledge.json 的 books 段）。
 *
 * <p>诚实声明：本模块只提供书目元数据（部类 / 年代 / 著者 / 提要），
 * 报告与语料中没有这 60 部书的正文，因此这里不做「点开就能读原文」的虚假承诺；
 * 详情页展示的是「这本书在本平台留下了哪些痕迹」——被哪些语料对引用、对应哪些日历词条。</p>
 */
@Service
public class BookService {

    /** 与 H5 版一致的部类配色，保证同一本书在两个端上是同一个封面 */
    private static final Map<String, String[][]> PALETTE = new LinkedHashMap<>();

    static {
        PALETTE.put("经部", new String[][]{{"#3f7d63", "#7fb79a"}, {"#2f6b57", "#6aa88c"}});
        PALETTE.put("史部", new String[][]{{"#9c3f36", "#d98b6a"}, {"#8a3830", "#c97a5c"}});
        PALETTE.put("子部", new String[][]{{"#2f6b6b", "#7fb3ad"}, {"#356f57", "#86b894"}});
        PALETTE.put("集部", new String[][]{{"#33587d", "#7fa3c4"}, {"#3b4f7d", "#8b9ec9"}});
    }

    private final KnowledgeBase kb;
    private final CorpusService corpusService;
    private final BookNotes bookNotes;

    public BookService(KnowledgeBase kb, CorpusService corpusService, BookNotes bookNotes) {
        this.kb = kb;
        this.corpusService = corpusService;
        this.bookNotes = bookNotes;
    }

    public Map<String, Object> list(String kw, String bu, String era, int page, int size) {
        String k = kw == null ? "" : kw.trim();
        String b = bu == null ? "" : bu.trim();
        String e = era == null ? "" : era.trim();
        List<KnowledgeBase.Book> hits = new ArrayList<>();
        for (KnowledgeBase.Book book : kb.getBooks()) {
            if (!b.isEmpty() && !b.equals(book.getBu())) {
                continue;
            }
            if (!e.isEmpty() && !e.equals(book.getEra())) {
                continue;
            }
            if (!k.isEmpty() && !match(book, k)) {
                continue;
            }
            hits.add(book);
        }
        int p = Math.max(1, page);
        int s = Math.min(60, Math.max(1, size));
        int from = (p - 1) * s;
        List<Map<String, Object>> slice = new ArrayList<>();
        for (int i = from; i < hits.size() && i < from + s; i++) {
            slice.add(toMap(hits.get(i)));
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("list", slice);
        m.put("total", hits.size());
        m.put("page", p);
        m.put("size", s);
        m.put("pages", (hits.size() + s - 1) / s);
        m.put("bus", facets(true));
        m.put("eras", facets(false));
        m.put("poolSize", kb.getBooks().size());
        return m;
    }

    public Map<String, Object> detail(String name) {
        KnowledgeBase.Book target = null;
        for (KnowledgeBase.Book book : kb.getBooks()) {
            if (book.getName().equals(name)) {
                target = book;
                break;
            }
        }
        if (target == null) {
            throw BizException.notFound("书目不存在：" + name);
        }
        BookNotes.Note note = bookNotes.of(name);

        // 1) 直接引用：出处里出现了书名或通行别名（《易》《老子》《左传》…）
        List<Map<String, Object>> pairs = new ArrayList<>();
        for (KnowledgeBase.Pair pair : kb.getPairs()) {
            if (citedBy(pair.getSource(), name, note)) {
                pairs.add(pairMap(pair));
            }
        }

        // 2) 相关词条：出处命中书名/别名，或命中本书名句的篇名（如《水调歌头》→ 东坡乐府）
        List<Map<String, Object>> calendar = new ArrayList<>();
        for (KnowledgeBase.CalendarEntry entry : kb.getCalendar()) {
            if (citedBy(entry.getSource(), name, note) || hitsQuote(entry.getSource(), note)) {
                Map<String, Object> cm = new LinkedHashMap<>();
                cm.put("word", entry.getWord());
                cm.put("modern", entry.getModern());
                cm.put("category", entry.getCategory());
                cm.put("source", entry.getSource());
                calendar.add(cm);
            }
        }

        // 3) 同部类参考语料：直接引用为空时兜底，明确标注「不是本书引文」
        List<Map<String, Object>> buPairs = new ArrayList<>();
        if (pairs.isEmpty()) {
            for (KnowledgeBase.Pair pair : kb.getPairs()) {
                if (buPairs.size() >= 6) {
                    break;
                }
                KnowledgeBase.Book owner = bookOfSource(pair.getSource());
                if (owner != null && owner.getBu().equals(target.getBu())) {
                    buPairs.add(pairMap(pair));
                }
            }
        }

        // 4) 名句摘录
        List<Map<String, Object>> quotes = new ArrayList<>();
        if (note != null) {
            for (BookNotes.Quote q : note.getQuotes()) {
                Map<String, Object> qm = new LinkedHashMap<>();
                qm.put("text", q.getText());
                qm.put("from", q.getFrom());
                quotes.add(qm);
            }
        }

        // 5) 同作者作品：作者相同即视为「本集可能收录」，明确不作确证
        List<Map<String, Object>> authorPairs = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> pm : pairs) {
            seen.add(String.valueOf(pm.get("modern")));
        }
        List<String> authors = new ArrayList<>();
        if (target.getAuthor() != null && !target.getAuthor().isEmpty()) {
            authors.add(target.getAuthor());
        }
        if (note != null) {
            authors.addAll(note.getAuthorAlias());
        }
        for (KnowledgeBase.Pair pair : kb.getPairs()) {
            if (authors.isEmpty() || pair.getSource() == null || seen.contains(pair.getModern())) {
                continue;
            }
            for (String a : authors) {
                if (a.length() >= 2 && pair.getSource().contains(a)) {
                    authorPairs.add(pairMap(pair));
                    seen.add(pair.getModern());
                    break;
                }
            }
        }

        List<Map<String, Object>> sameBu = new ArrayList<>();
        for (KnowledgeBase.Book book : kb.getBooks()) {
            if (!book.getName().equals(name) && book.getBu().equals(target.getBu()) && sameBu.size() < 8) {
                sameBu.add(toMap(book));
            }
        }

        Map<String, Object> m = toMap(target);
        m.put("note", note == null ? "" : note.getNote());
        m.put("alias", note == null ? new ArrayList<>() : note.getAlias());
        m.put("quotes", quotes);
        m.put("buIntro", bookNotes.introOf(target.getBu()));
        m.put("relatedPairs", pairs);
        m.put("buPairs", buPairs);
        m.put("authorPairs", authorPairs);
        m.put("relatedCalendar", calendar);
        m.put("sameBu", sameBu);
        m.put("relatedPairCount", pairs.size());
        m.put("relatedCalendarCount", calendar.size());
        m.put("quoteCount", quotes.size());
        m.put("honest", "本模块只提供书目元数据与带篇名的名句摘录；60 部书的正文不在报告语料范围内，"
                + "故不提供全文阅读。「同部类参考语料」不是本书引文，已单独标注。");
        return m;
    }

    /** 出处是否直接引用了本书（书名或通行别名） */
    private boolean citedBy(String source, String name, BookNotes.Note note) {
        if (source == null || source.isEmpty()) {
            return false;
        }
        if (source.contains(name)) {
            return true;
        }
        if (note == null) {
            return false;
        }
        for (String alias : note.getAlias()) {
            if (alias.equals(name)) {
                continue;
            }
            // 短别名（如「易」）必须带书名号才算命中，避免误伤「容易」这类普通词
            if (source.contains("《" + alias)) {
                return true;
            }
            if (alias.length() >= 2 && source.contains(alias)) {
                return true;
            }
        }
        return false;
    }

    /** 日历出处里是否出现了本书名句的篇名（如「水调歌头」） */
    private boolean hitsQuote(String source, BookNotes.Note note) {
        if (source == null || note == null) {
            return false;
        }
        for (BookNotes.Quote q : note.getQuotes()) {
            String from = q.getFrom();
            if (from == null || from.isEmpty()) {
                continue;
            }
            String key = from.split("·")[0].trim();
            if (key.length() >= 3 && source.contains(key)) {
                return true;
            }
        }
        return false;
    }

    /** 反查一条语料出处的「主人」是哪部书，用于同部类归组 */
    private KnowledgeBase.Book bookOfSource(String source) {
        if (source == null || source.isEmpty()) {
            return null;
        }
        for (KnowledgeBase.Book b : kb.getBooks()) {
            if (source.contains(b.getName())) {
                return b;
            }
        }
        for (KnowledgeBase.Book b : kb.getBooks()) {
            BookNotes.Note n = bookNotes.of(b.getName());
            if (n == null) {
                continue;
            }
            for (String alias : n.getAlias()) {
                if (source.contains("《" + alias)) {
                    return b;
                }
            }
        }
        return null;
    }

    private Map<String, Object> pairMap(KnowledgeBase.Pair pair) {
        Map<String, Object> pm = new LinkedHashMap<>();
        pm.put("modern", pair.getModern());
        pm.put("ancient", pair.getAncient());
        pm.put("source", pair.getSource());
        pm.put("categories", pair.getCategories());
        Corpus c = corpusService.requireByModern(pair.getModern());
        pm.put("corpusId", c == null ? null : c.getId());
        return pm;
    }

    /** 随机取一部，用于书库「随便翻一本」 */
    public Map<String, Object> random() {
        List<KnowledgeBase.Book> books = kb.getBooks();
        if (books.isEmpty()) {
            throw BizException.notFound("书目为空");
        }
        int idx = (int) (Math.abs(System.nanoTime()) % books.size());
        return toMap(books.get(idx));
    }

    private boolean match(KnowledgeBase.Book book, String kw) {
        if (contains(book.getName(), kw) || contains(book.getAuthor(), kw)
                || contains(book.getIntro(), kw) || contains(book.getEra(), kw)
                || contains(book.getBu(), kw)) {
            return true;
        }
        // 别名与要旨也参与检索：搜「老子」应能找到《道德经》，搜「易」应能找到《周易》
        BookNotes.Note n = bookNotes.of(book.getName());
        if (n == null) {
            return false;
        }
        if (contains(n.getNote(), kw)) {
            return true;
        }
        for (String alias : n.getAlias()) {
            if (contains(alias, kw)) {
                return true;
            }
        }
        for (BookNotes.Quote q : n.getQuotes()) {
            if (contains(q.getText(), kw) || contains(q.getFrom(), kw)) {
                return true;
            }
        }
        return false;
    }

    private static boolean contains(String src, String kw) {
        return src != null && src.contains(kw);
    }

    private List<Map<String, Object>> facets(boolean byBu) {
        Set<String> keys = new LinkedHashSet<>();
        for (KnowledgeBase.Book b : kb.getBooks()) {
            keys.add(byBu ? b.getBu() : b.getEra());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (String key : keys) {
            int count = 0;
            for (KnowledgeBase.Book b : kb.getBooks()) {
                if (key.equals(byBu ? b.getBu() : b.getEra())) {
                    count++;
                }
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", key);
            m.put("count", count);
            out.add(m);
        }
        return out;
    }

    private Map<String, Object> toMap(KnowledgeBase.Book b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", b.getName());
        m.put("bu", b.getBu());
        m.put("era", b.getEra());
        m.put("author", b.getAuthor());
        m.put("intro", b.getIntro());
        long seed = hash(b.getName());
        String[][] palette = PALETTE.getOrDefault(b.getBu(), PALETTE.get("经部"));
        String[] colors = palette[(int) (seed % palette.length)];
        m.put("seed", seed);
        m.put("color1", colors[0]);
        m.put("color2", colors[1]);
        BookNotes.Note n = bookNotes.of(b.getName());
        m.put("quoteCount", n == null ? 0 : n.getQuotes().size());
        return m;
    }

    /** 与 H5 版 hashCode 完全一致（h = h*31 + charCode，再取无符号 32 位） */
    private static long hash(String s) {
        long h = 0;
        for (int i = 0; i < s.length(); i++) {
            h = (h * 31 + s.charAt(i)) & 0xFFFFFFFFL;
        }
        return h;
    }
}
