package com.yumai.entity;

import lombok.Getter;
import lombok.Setter;

import javax.persistence.*;

@Getter
@Setter
@Entity
@Table(name = "t_quiz_question")
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "stem", nullable = false, length = 500)
    private String stem;

    @Column(name = "option_a", length = 200)
    private String optionA;

    @Column(name = "option_b", length = 200)
    private String optionB;

    @Column(name = "option_c", length = 200)
    private String optionC;

    @Column(name = "option_d", length = 200)
    private String optionD;

    @Column(name = "answer", nullable = false, length = 2)
    private String answer;

    @Column(name = "analysis", length = 500)
    private String analysis;

    @Column(name = "difficulty", length = 10)
    private String difficulty;

    @Column(name = "category", length = 40)
    private String category;
}
