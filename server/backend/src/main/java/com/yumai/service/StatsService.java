package com.yumai.service;

import com.yumai.common.RedisKeys;
import com.yumai.entity.Corpus;
import com.yumai.repository.AdaptLogRepository;
import com.yumai.repository.CorpusRepository;
import com.yumai.repository.FavoriteRepository;
import com.yumai.repository.QuizRecordRepository;
import com.yumai.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据看板：MySQL 做聚合、Redis 承担实时指标（UV/PV/热词）。
 */
@Service
public class StatsService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

    private final CorpusRepository corpusRepository;
    private final UserRepository userRepository;
    private final FavoriteRepository favoriteRepository;
    private final QuizRecordRepository quizRecordRepository;
    private final AdaptLogRepository adaptLogRepository;
    private final RedisService redis;
    private final KnowledgeBase kb;

    public StatsService(CorpusRepository corpusRepository, UserRepository userRepository,
                        FavoriteRepository favoriteRepository, QuizRecordRepository quizRecordRepository,
                        AdaptLogRepository adaptLogRepository, RedisService redis, KnowledgeBase kb) {
        this.corpusRepository = corpusRepository;
        this.userRepository = userRepository;
        this.favoriteRepository = favoriteRepository;
        this.quizRecordRepository = quizRecordRepository;
        this.adaptLogRepository = adaptLogRepository;
        this.redis = redis;
        this.kb = kb;
    }

    public Map<String, Object> overview() {
        String today = LocalDate.now().format(DAY);
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("corpusTotal", corpusRepository.count());
        m.put("corpusReal", corpusRepository.countByDataSource("REAL"));
        m.put("corpusTemplate", corpusRepository.countByDataSource("TEMPLATE"));
        m.put("userTotal", userRepository.count());
        m.put("favoriteTotal", favoriteRepository.count());
        m.put("quizTotal", quizRecordRepository.count());
        m.put("adaptTotal", adaptLogRepository.count());
        m.put("adaptToday", adaptLogRepository.countByCreatedAtAfter(startOfDay));
        m.put("uvToday", redis.pfCount(RedisKeys.statsUv(today)));
        m.put("pvToday", sumPv(today));
        m.put("knowledge", kb.stats());

        Map<String, Object> modes = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : redis.hgetAll(RedisKeys.ADAPT_COUNTER).entrySet()) {
            modes.put(e.getKey(), e.getValue());
        }
        if (modes.isEmpty()) {
            for (Object[] row : adaptLogRepository.countByMode()) {
                modes.put(String.valueOf(row[0]), row[1]);
            }
        }
        m.put("adaptModes", modes);
        return m;
    }

    /** 分类分布：按顿号拆分后累计 */
    public List<Map<String, Object>> categoryDistribution() {
        Map<String, Integer> counter = new LinkedHashMap<>();
        for (String row : corpusRepository.listRealCategories()) {
            if (row == null) {
                continue;
            }
            for (String part : row.split("、")) {
                String key = part.trim();
                if (!key.isEmpty()) {
                    counter.merge(key, 1, Integer::sum);
                }
            }
        }
        List<Map<String, Object>> list = new ArrayList<>();
        counter.entrySet().stream().sorted((a, b) -> b.getValue() - a.getValue()).forEach(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", e.getKey());
            m.put("value", e.getValue());
            list.add(m);
        });
        return list;
    }

    public List<Map<String, Object>> popularityDistribution() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Object[] row : corpusRepository.countByPopularity()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", row[0] == null ? "未标注" : String.valueOf(row[0]));
            m.put("value", row[1]);
            list.add(m);
        }
        return list;
    }

    /** 近 7 日改编调用趋势（MySQL），叠加 Redis 记录的当日 UV */
    public List<Map<String, Object>> trend7d() {
        LocalDate from = LocalDate.now().minusDays(6);
        Map<String, Long> dbCount = new HashMap<>();
        for (Object[] row : adaptLogRepository.dailyCounts(from.atStartOfDay())) {
            dbCount.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        List<Map<String, Object>> list = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            LocalDate d = from.plusDays(i);
            String key = d.format(DAY);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("day", key.substring(4));
            m.put("date", d.toString());
            m.put("count", dbCount.getOrDefault(d.toString(), 0L));
            m.put("uv", redis.pfCount(RedisKeys.statsUv(key)));
            list.add(m);
        }
        return list;
    }

    public List<Map<String, Object>> hotWords(int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        List<long[]> tops = redis.hotTop(Math.max(1, n));
        if (tops.isEmpty()) {
            for (Corpus c : corpusRepository.topByView(PageRequest.of(0, n))) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", c.getId());
                m.put("modern", c.getModern());
                m.put("ancient", c.getAncient());
                m.put("score", c.getViewCount());
                list.add(m);
            }
            return list;
        }
        List<Long> ids = new ArrayList<>();
        for (long[] t : tops) {
            ids.add(t[0]);
        }
        Map<Long, Corpus> map = new HashMap<>();
        for (Corpus c : corpusRepository.findAllByIds(ids)) {
            map.put(c.getId(), c);
        }
        for (long[] t : tops) {
            Corpus c = map.get(t[0]);
            if (c == null) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("modern", c.getModern());
            m.put("ancient", c.getAncient());
            m.put("score", t[1]);
            list.add(m);
        }
        return list;
    }

    public Map<String, Object> dashboard() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("overview", overview());
        m.put("categories", categoryDistribution());
        m.put("popularity", popularityDistribution());
        m.put("trend", trend7d());
        m.put("hotWords", hotWords(8));
        return m;
    }

    private long sumPv(String day) {
        long total = 0;
        for (Object v : redis.hgetAll(RedisKeys.statsPv(day)).values()) {
            try {
                total += Long.parseLong(String.valueOf(v));
            } catch (NumberFormatException ignored) {
                // 忽略脏值
            }
        }
        return total;
    }
}
