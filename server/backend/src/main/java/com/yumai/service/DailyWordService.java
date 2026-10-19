package com.yumai.service;

import com.yumai.common.RedisKeys;
import com.yumai.entity.Corpus;
import com.yumai.repository.CorpusRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 每日一词。规则：以「日序 % 词条数」做确定性排期，同一天所有用户看到同一条；
 * Redis 缓存到当日 24 点，跨天自动失效，无需定时任务。
 */
@Service
public class DailyWordService {

    private final KnowledgeBase kb;
    private final CorpusService corpusService;
    private final RedisService redis;

    public DailyWordService(KnowledgeBase kb, CorpusService corpusService, RedisService redis) {
        this.kb = kb;
        this.corpusService = corpusService;
        this.redis = redis;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> today() {
        LocalDate today = LocalDate.now();
        String key = RedisKeys.dailyWord(today.toString());
        Object cached = redis.getObject(key, Object.class);
        if (cached instanceof Map) {
            return (Map<String, Object>) cached;
        }

        List<KnowledgeBase.CalendarEntry> pool = kb.getCalendar();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("date", today.toString());
        if (pool.isEmpty()) {
            Corpus c = corpusService.randomReal();
            data.put("word", c.getModern());
            data.put("modern", c.getModern());
            data.put("corpus", corpusService.toMap(c, null));
        } else {
            int idx = (int) (today.toEpochDay() % pool.size());
            KnowledgeBase.CalendarEntry entry = pool.get(idx);
            data.put("word", entry.getWord());
            data.put("category", entry.getCategory());
            data.put("modern", entry.getModern());
            data.put("source", entry.getSource());
            data.put("grammar", entry.getGrammar());
            data.put("usage", entry.getUsage());
            data.put("misuse", entry.getMisuse());
            data.put("examples", entry.getExamples());
            Corpus c = corpusService.requireByModern(entry.getWord());
            data.put("corpus", c == null ? null : corpusService.toMap(c, null));
            data.put("index", idx + 1);
            data.put("poolSize", pool.size());
        }

        long ttl = Duration.between(LocalDateTime.now(), today.plusDays(1).atStartOfDay()).getSeconds();
        redis.setObject(key, data, Math.max(60, ttl));
        return data;
    }

    /** 未来若干天的排期预览 */
    public List<Map<String, Object>> timeline(int days) {
        List<KnowledgeBase.CalendarEntry> pool = kb.getCalendar();
        List<Map<String, Object>> list = new ArrayList<>();
        int n = Math.min(30, Math.max(1, days));
        for (int i = 0; i < n; i++) {
            LocalDate d = LocalDate.now().plusDays(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("date", d.toString());
            if (pool.isEmpty()) {
                continue;
            }
            KnowledgeBase.CalendarEntry e = pool.get((int) (d.toEpochDay() % pool.size()));
            m.put("word", e.getWord());
            m.put("modern", e.getModern());
            m.put("category", e.getCategory());
            list.add(m);
        }
        return list;
    }
}
