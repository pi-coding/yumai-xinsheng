package com.yumai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.Setter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 书目增强层：从 classpath:seed/book_notes.json 载入。
 * <p>
 * 解决一个真实问题：60 部典籍里只有 10 部能在报告语料里找到直接引用的出处，
 * 其余 50 部点开详情是空的。本层为每部书补三样东西——
 * <ol>
 *   <li><b>要旨</b>（note）：这本书在文言考据／改写里到底有什么用；</li>
 *   <li><b>名句摘录</b>（quotes）：带篇名的原文句，供核对，不代替校勘；</li>
 *   <li><b>别名</b>（alias）：让《易》《老子》《左传》这类通行别名也能匹配到语料出处。</li>
 * </ol>
 * 工具型典籍（韵书、政书、类书）不强行摘句，只给要旨——宁可少写，不编名句。
 */
@Component
public class BookNotes {

    private final ObjectMapper mapper;

    @Getter
    private Map<String, Note> notes = new LinkedHashMap<>();
    @Getter
    private Map<String, String> buIntro = new LinkedHashMap<>();
    @Getter
    private String note = "";

    public BookNotes(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @SuppressWarnings("unchecked")
    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("seed/book_notes.json").getInputStream()) {
            Map<String, Object> root = mapper.readValue(in, Map.class);
            this.note = str(root.get("note"));
            Map<String, Object> bu = (Map<String, Object>) root.get("buIntro");
            if (bu != null) {
                for (Map.Entry<String, Object> e : bu.entrySet()) {
                    buIntro.put(e.getKey(), str(e.getValue()));
                }
            }
            Map<String, Object> books = (Map<String, Object>) root.get("books");
            if (books != null) {
                for (Map.Entry<String, Object> e : books.entrySet()) {
                    Map<String, Object> m = (Map<String, Object>) e.getValue();
                    Note n = new Note();
                    n.setName(e.getKey());
                    n.setNote(str(m.get("note")));
                    n.setAlias(joinList(m.get("alias")));
                    n.setAuthorAlias(joinList(m.get("authorAlias")));
                    List<Quote> qs = new ArrayList<>();
                    List<Map<String, Object>> raw = (List<Map<String, Object>>) m.get("quotes");
                    if (raw != null) {
                        for (Map<String, Object> q : raw) {
                            Quote q1 = new Quote();
                            q1.setText(str(q.get("text")));
                            q1.setFrom(str(q.get("from")));
                            qs.add(q1);
                        }
                    }
                    n.setQuotes(qs);
                    notes.put(n.getName(), n);
                }
            }
        } catch (Exception ex) {
            // 增强层缺失不应影响主流程：书库仍可只靠元数据工作
            this.note = "书目增强层载入失败：" + ex.getMessage();
        }
    }

    public Note of(String name) {
        return notes.get(name);
    }

    public String introOf(String bu) {
        return buIntro.getOrDefault(bu, "");
    }

    private static List<String> joinList(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof List) {
            for (Object o : (List<Object>) v) {
                String s = str(o);
                if (!s.isEmpty()) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    @Getter
    @Setter
    public static class Note {
        private String name;
        private String note;
        private List<String> alias = new ArrayList<>();
        /** 作者别名（如「陶潜」与「陶渊明」），仅用于按作者关联语料 */
        private List<String> authorAlias = new ArrayList<>();
        private List<Quote> quotes = new ArrayList<>();
    }

    @Getter
    @Setter
    public static class Quote {
        private String text;
        private String from;
    }
}
