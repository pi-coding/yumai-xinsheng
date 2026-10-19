package com.yumai.repository;

import com.yumai.entity.Corpus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface CorpusRepository extends JpaRepository<Corpus, Long> {

    Optional<Corpus> findByCode(String code);

    boolean existsByCode(String code);

    long countByDataSource(String dataSource);

    @Query("select c from Corpus c where " +
            "(:kw is null or :kw = '' or c.modern like concat('%', :kw, '%') " +
            " or c.ancient like concat('%', :kw, '%') or c.source like concat('%', :kw, '%') " +
            " or c.tags like concat('%', :kw, '%')) " +
            "and (:category is null or :category = '' or c.categories like concat('%', :category, '%')) " +
            "and (:dataSource is null or :dataSource = '' or c.dataSource = :dataSource)")
    Page<Corpus> search(@Param("kw") String kw,
                        @Param("category") String category,
                        @Param("dataSource") String dataSource,
                        Pageable pageable);

    @Query("select c from Corpus c where c.id in :ids")
    List<Corpus> findAllByIds(@Param("ids") List<Long> ids);

    @Modifying
    @Transactional
    @Query("update Corpus c set c.viewCount = c.viewCount + 1 where c.id = :id")
    int incrView(@Param("id") Long id);

    @Modifying
    @Transactional
    @Query("update Corpus c set c.favCount = c.favCount + :delta where c.id = :id")
    int incrFav(@Param("id") Long id, @Param("delta") long delta);

    @Query("select distinct c.categories from Corpus c where c.dataSource = 'REAL'")
    List<String> listRealCategories();

    @Query("select c.popularity, count(c) from Corpus c group by c.popularity")
    List<Object[]> countByPopularity();

    @Query("select c from Corpus c where c.dataSource = 'REAL' order by c.viewCount desc")
    List<Corpus> topByView(Pageable pageable);
}
