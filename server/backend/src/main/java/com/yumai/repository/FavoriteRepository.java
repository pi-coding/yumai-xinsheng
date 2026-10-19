package com.yumai.repository;

import com.yumai.entity.Favorite;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {

    Optional<Favorite> findByUserIdAndCorpusId(Long userId, Long corpusId);

    boolean existsByUserIdAndCorpusId(Long userId, Long corpusId);

    @Transactional
    void deleteByUserIdAndCorpusId(Long userId, Long corpusId);

    List<Favorite> findByUserIdOrderByIdDesc(Long userId);

    Page<Favorite> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    long countByUserId(Long userId);

    long countByCorpusId(Long corpusId);
}
