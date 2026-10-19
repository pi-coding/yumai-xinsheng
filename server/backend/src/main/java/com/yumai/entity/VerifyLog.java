package com.yumai.entity;

import lombok.Getter;
import lombok.Setter;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;
import java.time.LocalDateTime;

/**
 * 溯源自查流水：记录用户查过哪些文案、判定结论与可信度，供「我的核验记录」回溯。
 */
@Entity
@Table(name = "t_verify_log")
@Getter
@Setter
public class VerifyLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "input_text")
    private String inputText;

    /** 判定结论：有据可考 / 出处存疑 / 出处讹变 / 伪古风 / 真伪混杂 / 未收录 */
    @Column(name = "verdict")
    private String verdict;

    @Column(name = "credibility")
    private Integer credibility;

    @Column(name = "hit_count")
    private Integer hitCount;

    @Column(name = "suspect_count")
    private Integer suspectCount;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
