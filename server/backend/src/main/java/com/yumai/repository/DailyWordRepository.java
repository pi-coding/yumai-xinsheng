package com.yumai.repository;

import com.yumai.entity.DailyWord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface DailyWordRepository extends JpaRepository<DailyWord, Long> {

    Optional<DailyWord> findByDayOf(LocalDate dayOf);
}
