package com.yumai.repository;

import com.yumai.entity.QuizQuestion;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, Long> {

    long countByCategory(String category);

    @Query("select distinct q.category from QuizQuestion q")
    List<String> listCategories();

    @Query("select q from QuizQuestion q order by function('RAND')")
    List<QuizQuestion> randomQuestions(Pageable pageable);
}
