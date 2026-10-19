package com.yumai.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;
import lombok.Setter;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * 改编工坊的调用流水，用于统计分析。
 */
@Getter
@Setter
@Entity
@Table(name = "t_adapt_log", indexes = {
        @Index(name = "idx_adapt_user", columnList = "user_id")
})
public class AdaptLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "input_text", length = 1200)
    private String inputText;

    @Column(name = "output_text", length = 1200)
    private String outputText;

    @Column(name = "mode", length = 10)
    private String mode;

    @Column(name = "ctx", length = 10)
    private String context;

    @Column(name = "tone", length = 10)
    private String tone;

    @Column(name = "form", length = 20)
    private String form;

    @Column(name = "matched_code", length = 20)
    private String matchedCode;

    @Column(name = "hit_cache")
    private Integer hitCache = 0;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
