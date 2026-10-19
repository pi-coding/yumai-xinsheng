package com.yumai.repository;

import com.yumai.entity.BookFav;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface BookFavRepository extends JpaRepository<BookFav, Long> {

    Optional<BookFav> findByUserIdAndBookName(Long userId, String bookName);

    boolean existsByUserIdAndBookName(Long userId, String bookName);

    @Transactional
    void deleteByUserIdAndBookName(Long userId, String bookName);

    List<BookFav> findByUserIdOrderByIdDesc(Long userId);

    long countByUserId(Long userId);
}
