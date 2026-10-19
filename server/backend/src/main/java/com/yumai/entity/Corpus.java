package com.yumai.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Getter;
import lombok.Setter;

import javax.persistence.*;
import java.time.LocalDateTime;

/**
 * 语料条目：现代网络用语 ↔ 古风表达 的对照。
 * 所有列名显式声明，避免依赖命名策略。
 */
@Getter
@Setter
@Entity
@Table(name = "t_corpus", indexes = {
        @Index(name = "idx_corpus_modern", columnList = "modern"),
        @Index(name = "idx_corpus_data_source", columnList = "data_source")
})
public class Corpus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "code", length = 20, unique = true)
    private String code;

    @Column(name = "modern", nullable = false, length = 255)
    private String modern;

    @Column(name = "ancient", nullable = false, length = 600)
    private String ancient;

    @Column(name = "source", length = 300)
    private String source;

    @Column(name = "categories", length = 255)
    private String categories;

    @Column(name = "tags", length = 255)
    private String tags;

    @Column(name = "platform", length = 120)
    private String platform;

    @Column(name = "popularity", length = 20)
    private String popularity;

    @Column(name = "era", length = 30)
    private String era;

    @Column(name = "emotion", length = 30)
    private String emotion;

    @Column(name = "rhetoric", length = 120)
    private String rhetoric;

    @Column(name = "style", length = 30)
    private String style;

    @Column(name = "confidence")
    private Double confidence;

    /** REAL=报告真实语料；TEMPLATE=模板生成的扩展语料 */
    @Column(name = "data_source", length = 20)
    private String dataSource = "REAL";

    @Column(name = "view_count")
    private Long viewCount = 0L;

    @Column(name = "fav_count")
    private Long favCount = 0L;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
