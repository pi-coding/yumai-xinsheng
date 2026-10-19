package com.yumai.repository;

import com.yumai.entity.AdaptLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface AdaptLogRepository extends JpaRepository<AdaptLog, Long> {

    long countByCreatedAtAfter(LocalDateTime time);

    long countByUserId(Long userId);

    @Query("select a.mode, count(a) from AdaptLog a group by a.mode")
    List<Object[]> countByMode();

    List<AdaptLog> findTop10ByUserIdOrderByIdDesc(Long userId);

    @org.springframework.data.jpa.repository.Query(
            value = "select date(created_at) as d, count(*) as c from t_adapt_log where created_at >= :from " +
                    "group by date(created_at) order by d",
            nativeQuery = true)
    List<Object[]> dailyCounts(@org.springframework.data.repository.query.Param("from") LocalDateTime from);
}
