package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.common.PageResult;
import com.yumai.common.RedisKeys;
import com.yumai.entity.Corpus;
import com.yumai.repository.CorpusRepository;
import com.yumai.repository.FavoriteRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CorpusService {

    private final CorpusRepository corpusRepository;
    private final FavoriteRepository favoriteRepository;
    private final RedisService redis;

    public CorpusService(CorpusRepository corpusRepository, FavoriteRepository favoriteRepository, RedisService redis) {
        this.corpusRepository = corpusRepository;
        this.favoriteRepository = favoriteRepository;
        this.redis = redis;
    }

    /**
     * 检索。命中 Redis 的历史查询（5 分钟）直接返回，降低热点查询对 MySQL 的压力。
     */
    @SuppressWarnings("unchecked")
    public PageResult<Map<String, Object>> search(String kw, String category, String dataSource,
                                                  int page, int size, String sort, Long userId) {
        int p = Math.max(1, page);
        int s = Math.min(60, Math.max(1, size));
        String sortKey = sort == null ? "default" : sort;
        String signature = (kw == null ? "" : kw.trim()) + "|" + (category == null ? "" : category) + "|"
                + (dataSource == null ? "" : dataSource) + "|" + p + "|" + s + "|" + sortKey;
        String cacheKey = RedisKeys.corpusSearch(Integer.toHexString(signature.hashCode()));
        if (kw == null || kw.trim().isEmpty()) {
            Object cached = redis.getObject(cacheKey, Object.class);
            if (cached instanceof Map) {
                Map<String, Object> m = (Map<String, Object>) cached;
                return new PageResult<>(((Number) m.get("total")).longValue(), p, s,
                        new ArrayList<>((Collection<Map<String, Object>>) m.get("list")));
            }
        }

        Sort sortSpec;
        if ("view".equals(sortKey)) {
            sortSpec = Sort.by(Sort.Direction.DESC, "viewCount").and(Sort.by(Sort.Direction.DESC, "id"));
        } else if ("fav".equals(sortKey)) {
            sortSpec = Sort.by(Sort.Direction.DESC, "favCount").and(Sort.by(Sort.Direction.DESC, "id"));
        } else {
            sortSpec = Sort.by(Sort.Direction.ASC, "id");
        }
        Page<Corpus> result = corpusRepository.search(
                kw == null ? null : kw.trim(),
                category == null ? "" : category.trim(),
                dataSource == null ? "" : dataSource.trim(),
                PageRequest.of(p - 1, s, sortSpec));

        List<Map<String, Object>> list = new ArrayList<>();
        for (Corpus c : result.getContent()) {
            list.add(toMap(c, userId));
        }
        PageResult<Map<String, Object>> pageResult = new PageResult<>(result.getTotalElements(), p, s, list);

        if (kw == null || kw.trim().isEmpty()) {
            Map<String, Object> cacheValue = new LinkedHashMap<>();
            cacheValue.put("total", result.getTotalElements());
            cacheValue.put("list", list);
            redis.setObject(cacheKey, cacheValue, 300);
        }
        return pageResult;
    }

    @Transactional
    public Map<String, Object> detail(Long id, Long userId) {
        Corpus c = corpusRepository.findById(id).orElseThrow(() -> BizException.notFound("语料不存在"));
        corpusRepository.incrView(id);
        redis.hotIncr(id, 2);
        redis.evict(RedisKeys.corpusItem(id));
        Map<String, Object> m = toMap(c, userId);
        m.put("viewCount", (c.getViewCount() == null ? 0 : c.getViewCount()) + 1);
        m.put("hotScore", redis.hotScore(id));
        return m;
    }

    /** 热词榜：优先读 Redis ZSet，冷启动时回落到 MySQL 的浏览数排序 */
    public List<Map<String, Object>> hot(int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        List<long[]> tops = redis.hotTop(n);
        if (tops.isEmpty()) {
            for (Corpus c : corpusRepository.topByView(PageRequest.of(0, n))) {
                Map<String, Object> m = toMap(c, null);
                m.put("hotScore", c.getViewCount());
                list.add(m);
            }
            return list;
        }
        List<Long> ids = new ArrayList<>();
        for (long[] t : tops) {
            ids.add(t[0]);
        }
        Map<Long, Corpus> map = new LinkedHashMap<>();
        for (Corpus c : corpusRepository.findAllByIds(ids)) {
            map.put(c.getId(), c);
        }
        for (long[] t : tops) {
            Corpus c = map.get(t[0]);
            if (c == null) {
                continue;
            }
            Map<String, Object> m = toMap(c, null);
            m.put("hotScore", t[1]);
            list.add(m);
        }
        return list;
    }

    public List<Map<String, Object>> categories() {
        List<String> raw = corpusRepository.listRealCategories();
        Map<String, Integer> counter = new LinkedHashMap<>();
        for (String row : raw) {
            if (row == null) {
                continue;
            }
            for (String part : row.split("、")) {
                String key = part.trim();
                if (key.isEmpty()) {
                    continue;
                }
                counter.merge(key, 1, Integer::sum);
            }
        }
        List<Map<String, Object>> list = new ArrayList<>();
        counter.entrySet().stream()
                .sorted((a, b) -> b.getValue() - a.getValue())
                .forEach(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", e.getKey());
                    m.put("count", e.getValue());
                    list.add(m);
                });
        return list;
    }

    /** 随机取一条真实语料，供「每日一词」与首页推荐使用 */
    public Corpus randomReal() {
        Page<Corpus> page = corpusRepository.search(null, null, "REAL",
                PageRequest.of((int) (Math.random() * 3), 20, Sort.by("id")));
        List<Corpus> content = page.getContent();
        if (content.isEmpty()) {
            throw new BizException(404, "语料库尚无数据");
        }
        return content.get((int) (Math.random() * content.size()));
    }

    public Corpus requireByModern(String modern) {
        Page<Corpus> page = corpusRepository.search(modern, null, "REAL", PageRequest.of(0, 1));
        if (page.getContent().isEmpty()) {
            return null;
        }
        return page.getContent().get(0);
    }

    public Map<String, Object> toMap(Corpus c, Long userId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("code", c.getCode());
        m.put("modern", c.getModern());
        m.put("ancient", c.getAncient());
        m.put("source", c.getSource());
        m.put("categories", c.getCategories());
        m.put("tags", c.getTags());
        m.put("platform", c.getPlatform());
        m.put("popularity", c.getPopularity());
        m.put("era", c.getEra());
        m.put("emotion", c.getEmotion());
        m.put("style", c.getStyle());
        m.put("confidence", c.getConfidence());
        m.put("dataSource", c.getDataSource());
        m.put("viewCount", c.getViewCount());
        m.put("favCount", c.getFavCount());
        m.put("favorited", userId != null && favoriteRepository.existsByUserIdAndCorpusId(userId, c.getId()));
        return m;
    }
}
