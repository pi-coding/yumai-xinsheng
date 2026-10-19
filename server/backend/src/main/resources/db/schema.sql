-- ============================================================
-- 语脉新生 · 全栈版 数据库结构（MySQL 8.0 / utf8mb4）
-- 由 spring.sql.init 在启动时自动执行，语句均为幂等（IF NOT EXISTS）
-- ============================================================

CREATE TABLE IF NOT EXISTS t_user (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    username      VARCHAR(50)  NOT NULL COMMENT '登录名',
    password      VARCHAR(200) NOT NULL COMMENT 'PBKDF2 口令摘要',
    nickname      VARCHAR(50)  DEFAULT NULL COMMENT '昵称',
    avatar        VARCHAR(200) DEFAULT NULL COMMENT '头像标识',
    role          VARCHAR(20)  DEFAULT 'USER' COMMENT 'USER/ADMIN',
    status        INT          DEFAULT 1 COMMENT '1正常 0禁用',
    created_at    DATETIME     DEFAULT NULL,
    updated_at    DATETIME     DEFAULT NULL,
    last_login_at DATETIME     DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '平台用户';

CREATE TABLE IF NOT EXISTS t_corpus (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(20)  DEFAULT NULL COMMENT '语料编号 GF0001',
    modern      VARCHAR(255) NOT NULL COMMENT '现代网络用语',
    ancient     VARCHAR(600) NOT NULL COMMENT '古风表达',
    source      VARCHAR(300) DEFAULT NULL COMMENT '出处',
    categories  VARCHAR(255) DEFAULT NULL COMMENT '分类（顿号分隔）',
    tags        VARCHAR(255) DEFAULT NULL COMMENT '标签（顿号分隔）',
    platform    VARCHAR(120) DEFAULT NULL COMMENT '来源平台',
    popularity  VARCHAR(20)  DEFAULT NULL COMMENT '热度 高/中/低',
    era         VARCHAR(30)  DEFAULT NULL COMMENT '年代',
    emotion     VARCHAR(30)  DEFAULT NULL COMMENT '情感极性',
    rhetoric    VARCHAR(120) DEFAULT NULL COMMENT '修辞',
    style       VARCHAR(30)  DEFAULT NULL COMMENT '语体',
    confidence  DOUBLE       DEFAULT NULL COMMENT '置信度',
    data_source VARCHAR(20)  DEFAULT 'REAL' COMMENT 'REAL真实语料/TEMPLATE模板语料',
    view_count  BIGINT       DEFAULT 0 COMMENT '浏览次数',
    fav_count   BIGINT       DEFAULT 0 COMMENT '收藏次数',
    created_at  DATETIME     DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_corpus_code (code),
    KEY idx_corpus_modern (modern),
    KEY idx_corpus_data_source (data_source)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '古风网语语料';

CREATE TABLE IF NOT EXISTS t_favorite (
    id         BIGINT   NOT NULL AUTO_INCREMENT,
    user_id    BIGINT   NOT NULL,
    corpus_id  BIGINT   NOT NULL,
    created_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_fav_user_corpus (user_id, corpus_id),
    KEY idx_fav_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '收藏';

CREATE TABLE IF NOT EXISTS t_adapt_log (
    id           BIGINT        NOT NULL AUTO_INCREMENT,
    user_id      BIGINT        DEFAULT NULL,
    input_text   VARCHAR(1200) DEFAULT NULL,
    output_text  VARCHAR(1200) DEFAULT NULL,
    mode         VARCHAR(10)   DEFAULT NULL COMMENT 'm2c 今译古 / c2m 古译今',
    ctx          VARCHAR(10)   DEFAULT NULL COMMENT '语境',
    tone         VARCHAR(10)   DEFAULT NULL COMMENT '语气',
    form         VARCHAR(20)   DEFAULT NULL COMMENT '形式',
    matched_code VARCHAR(20)   DEFAULT NULL COMMENT '命中的语料编号',
    hit_cache    INT           DEFAULT 0 COMMENT '1=命中 Redis 缓存',
    created_at   DATETIME      DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_adapt_user (user_id),
    KEY idx_adapt_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '改编调用流水';

CREATE TABLE IF NOT EXISTS t_quiz_question (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    stem       VARCHAR(500) NOT NULL COMMENT '题干',
    option_a   VARCHAR(200) DEFAULT NULL,
    option_b   VARCHAR(200) DEFAULT NULL,
    option_c   VARCHAR(200) DEFAULT NULL,
    option_d   VARCHAR(200) DEFAULT NULL,
    answer     VARCHAR(2)   NOT NULL COMMENT '正确选项 A/B/C/D',
    analysis   VARCHAR(500) DEFAULT NULL COMMENT '解析',
    difficulty VARCHAR(10)  DEFAULT NULL COMMENT 'easy/normal/hard',
    category   VARCHAR(40)  DEFAULT NULL COMMENT '题目分类',
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '题库';

CREATE TABLE IF NOT EXISTS t_quiz_record (
    id          BIGINT   NOT NULL AUTO_INCREMENT,
    user_id     BIGINT   NOT NULL,
    total       INT      DEFAULT 0,
    correct     INT      DEFAULT 0,
    score       INT      DEFAULT 0,
    duration_ms BIGINT   DEFAULT 0,
    created_at  DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_quiz_user (user_id),
    KEY idx_quiz_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '答题记录';

CREATE TABLE IF NOT EXISTS t_daily_word (
    id        BIGINT      NOT NULL AUTO_INCREMENT,
    day_of    DATE        NOT NULL COMMENT '日期',
    corpus_id BIGINT      DEFAULT NULL,
    note      VARCHAR(300) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_daily_day (day_of)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '每日一词排期';

CREATE TABLE IF NOT EXISTS t_verify_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       DEFAULT NULL COMMENT '登录用户；匿名为空不落库',
    input_text    VARCHAR(1000) DEFAULT NULL COMMENT '核验原文（截断）',
    verdict       VARCHAR(20)  DEFAULT NULL COMMENT '有据可考/出处存疑/出处讹变/伪古风/真伪混杂/未收录',
    credibility   INT          DEFAULT NULL COMMENT '0-100 派生可信度，未收录为空',
    hit_count     INT          DEFAULT 0 COMMENT '命中条目数',
    suspect_count INT          DEFAULT 0 COMMENT '存疑或讹变条目数',
    created_at    DATETIME     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_verify_user (user_id),
    KEY idx_verify_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '溯源自查流水';

-- 小程序端的「古籍收藏」：t_favorite 收的是语料（corpus_id），这里收的是书目名，
-- 两者语义不同，不能混用一张表。未登录时小程序仍走本地 ymxs_favBooks，登录后与服务端合并。
CREATE TABLE IF NOT EXISTS t_book_fav (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    user_id    BIGINT      NOT NULL,
    book_name  VARCHAR(64) NOT NULL COMMENT '书目名，与书库 60 部一致',
    created_at DATETIME    DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_bfav_user_book (user_id, book_name),
    KEY idx_bfav_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '古籍收藏（书目级）';
