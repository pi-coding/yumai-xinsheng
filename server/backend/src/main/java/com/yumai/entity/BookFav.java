package com.yumai.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;
import lombok.Setter;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * 古籍收藏（书目级）。与 {@link Favorite} 不同：那边收藏的是语料行（corpus_id），
 * 这里收藏的是书库 60 部里的书名，供小程序端「我的收藏 · 书库」使用。
 */
@Getter
@Setter
@Entity
@Table(name = "t_book_fav", uniqueConstraints = {
        @UniqueConstraint(name = "uk_bfav_user_book", columnNames = {"user_id", "book_name"})
})
public class BookFav {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "book_name", nullable = false, length = 64)
    private String bookName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
