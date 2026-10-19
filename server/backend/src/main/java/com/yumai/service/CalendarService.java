package com.yumai.service;

import com.yumai.entity.Corpus;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 古风科普日历：知识库里的 16 条词条全量呈现 + 今日排期标记。
 * 排期规则与「每日一词」一致（日序 % 词条数），保证两个入口永远指向同一条。
 */
@Service
public class CalendarService {

    private final KnowledgeBase kb;
    private final CorpusService corpusService;

    public CalendarService(KnowledgeBase kb, CorpusService corpusService) {
        this.kb = kb;
        this.corpusService = corpusService;
    }

    public Map<String, Object> all() {
        List<KnowledgeBase.CalendarEntry> pool = kb.getCalendar();
        LocalDate today = LocalDate.now();
        int todayIdx = pool.isEmpty() ? -1 : (int) (today.toEpochDay() % pool.size());

        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < pool.size(); i++) {
            KnowledgeBase.CalendarEntry e = pool.get(i);
            Map<String, Object> m = entryToMap(e);
            m.put("index", i + 1);
            m.put("today", i == todayIdx);
            // 未来 32 天内不再轮到的词条，标注下次出现的日期，避免「为什么今天不是它」的困惑
            m.put("nextDate", nextOccurrence(today, i, pool.size()));
            list.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("date", today.toString());
        out.put("poolSize", pool.size());
        out.put("todayIndex", todayIdx + 1);
        out.put("today", todayIdx >= 0 ? list.get(todayIdx) : null);
        out.put("list", list);
        out.put("rule", "按「日序 % 词条数」确定性排期，同一天所有用户看到同一条；" + pool.size() + " 天一个完整轮回。");
        return out;
    }

    private Map<String, Object> entryToMap(KnowledgeBase.CalendarEntry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("word", e.getWord());
        m.put("category", e.getCategory());
        m.put("modern", e.getModern());
        m.put("source", e.getSource());
        m.put("grammar", e.getGrammar());
        m.put("usage", e.getUsage());
        m.put("misuse", e.getMisuse());
        List<String> examples = new ArrayList<>();
        if (e.getExamples() != null && !e.getExamples().isEmpty()) {
            for (String x : e.getExamples().split("、")) {
                if (!x.trim().isEmpty()) {
                    examples.add(x.trim());
                }
            }
        }
        m.put("examples", examples);
        Corpus c = corpusService.requireByModern(e.getWord());
        m.put("corpusId", c == null ? null : c.getId());
        return m;
    }

    private String nextOccurrence(LocalDate today, int index, int poolSize) {
        if (poolSize <= 0) {
            return "";
        }
        long todayIdx = today.toEpochDay() % poolSize;
        int gap = (int) ((index - todayIdx + poolSize) % poolSize);
        return today.plusDays(gap).toString();
    }
}
