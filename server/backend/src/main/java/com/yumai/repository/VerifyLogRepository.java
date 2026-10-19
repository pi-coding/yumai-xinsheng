package com.yumai.repository;

import com.yumai.entity.VerifyLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VerifyLogRepository extends JpaRepository<VerifyLog, Long> {

    List<VerifyLog> findByUserIdOrderByIdDesc(Long userId, Pageable pageable);

    long countByUserId(Long userId);
}
