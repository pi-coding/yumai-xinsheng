package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.common.PageResult;
import com.yumai.common.RedisKeys;
import com.yumai.entity.Corpus;
import com.yumai.entity.Favorite;
import com.yumai.repository.CorpusRepository;
import com.yumai.repository.FavoriteRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final CorpusRepository corpusRepository;
    private final CorpusService corpusService;
    private final RedisService redis;

    public FavoriteService(FavoriteRepository favoriteRepository, CorpusRepository corpusRepository,
                           CorpusService corpusService, RedisService redis) {
        this.favoriteRepository = favoriteRepository;
        this.corpusRepository = corpusRepository;
        this.corpusService = corpusService;
        this.redis = redis;
    }

    /** 收藏 / 取消收藏，DB 为准、Redis Set 做镜像读加速 */
    @Transactional
    public Map<String, Object> toggle(Long userId, Long corpusId) {
        Corpus corpus = corpusRepository.findById(corpusId)
                .orElseThrow(() -> BizException.notFound("语料不存在"));
        Optional<Favorite> exists = favoriteRepository.findByUserIdAndCorpusId(userId, corpusId);

        boolean favorited;
        if (exists.isPresent()) {
            favoriteRepository.deleteByUserIdAndCorpusId(userId, corpusId);
            redis.favRemove(userId, corpusId);
            corpusRepository.incrFav(corpusId, -1);
            favorited = false;
        } else {
            Favorite f = new Favorite();
            f.setUserId(userId);
            f.setCorpusId(corpusId);
            f.setCreatedAt(LocalDateTime.now());
            favoriteRepository.save(f);
            redis.favAdd(userId, corpusId);
            corpusRepository.incrFav(corpusId, 1);
            favorited = true;
        }
        redis.evict(RedisKeys.corpusItem(corpusId));
        redis.evictPrefix(RedisKeys.CORPUS_SEARCH);

        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("favorited", favorited);
        data.put("corpusId", corpusId);
        data.put("favCount", favoriteRepository.countByCorpusId(corpusId));
        data.put("modern", corpus.getModern());
        return data;
    }

    public PageResult<Map<String, Object>> list(Long userId, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(50, Math.max(1, size));
        org.springframework.data.domain.Page<Favorite> result =
                favoriteRepository.findByUserIdOrderByIdDesc(userId, PageRequest.of(p - 1, s));
        List<Map<String, Object>> list = new ArrayList<>();
        for (Favorite f : result.getContent()) {
            Corpus c = corpusRepository.findById(f.getCorpusId()).orElse(null);
            if (c == null) {
                continue;
            }
            Map<String, Object> m = corpusService.toMap(c, userId);
            m.put("favoritedAt", f.getCreatedAt());
            list.add(m);
        }
        return new PageResult<>(result.getTotalElements(), p, s, list);
    }

    public List<Long> ids(Long userId) {
        List<Long> ids = new ArrayList<>();
        for (Favorite f : favoriteRepository.findByUserIdOrderByIdDesc(userId)) {
            ids.add(f.getCorpusId());
        }
        return ids;
    }

    public boolean isFavorited(Long userId, Long corpusId) {
        if (redis.favContains(userId, corpusId)) {
            return true;
        }
        return favoriteRepository.existsByUserIdAndCorpusId(userId, corpusId);
    }

    public long count(Long userId) {
        return favoriteRepository.countByUserId(userId);
    }
}
