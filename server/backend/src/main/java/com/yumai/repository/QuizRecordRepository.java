package com.yumai.repository;

import com.yumai.entity.QuizRecord;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QuizRecordRepository extends JpaRepository<QuizRecord, Long> {

    List<QuizRecord> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    long countByUserId(Long userId);

    @Query("select coalesce(max(r.score),0) from QuizRecord r where r.userId = :userId")
    Integer maxScoreOfUser(Long userId);

    @Query("select r.total, r.correct, r.score from QuizRecord r order by r.id desc")
    List<Object[]> recentRecords(Pageable pageable);
}
