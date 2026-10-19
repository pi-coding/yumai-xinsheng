package com.yumai.entity;

import lombok.Getter;
import lombok.Setter;

import javax.persistence.*;
import java.time.LocalDate;

/**
 * 每日一词排期。
 */
@Getter
@Setter
@Entity
@Table(name = "t_daily_word", uniqueConstraints = {
        @UniqueConstraint(name = "uk_daily_day", columnNames = "day_of")
})
public class DailyWord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "day_of", nullable = false)
    private LocalDate dayOf;

    @Column(name = "corpus_id")
    private Long corpusId;

    @Column(name = "note", length = 300)
    private String note;
}
