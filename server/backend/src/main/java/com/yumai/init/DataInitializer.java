package com.yumai.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yumai.entity.Corpus;
import com.yumai.entity.QuizQuestion;
import com.yumai.entity.User;
import com.yumai.repository.CorpusRepository;
import com.yumai.repository.QuizQuestionRepository;
import com.yumai.repository.UserRepository;
import com.yumai.service.KnowledgeBase;
import com.yumai.service.PasswordService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 首次启动播种：语料、题库、内置账号。
 * 所有写入都以「表为空」为前提，重启不会重复插入。
 */
@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final CorpusRepository corpusRepository;
    private final QuizQuestionRepository quizRepository;
    private final UserRepository userRepository;
    private final KnowledgeBase kb;
    private final PasswordService passwordService;
    private final ObjectMapper mapper;

    @Value("${yumai.seed.enabled:true}")
    private boolean seedEnabled;

    public DataInitializer(CorpusRepository corpusRepository, QuizQuestionRepository quizRepository,
                           UserRepository userRepository, KnowledgeBase kb,
                           PasswordService passwordService, ObjectMapper mapper) {
        this.corpusRepository = corpusRepository;
        this.quizRepository = quizRepository;
        this.userRepository = userRepository;
        this.kb = kb;
        this.passwordService = passwordService;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seedEnabled) {
            log.info("已关闭数据播种（yumai.seed.enabled=false）");
            return;
        }
        seedCorpus();
        seedQuiz();
        seedUsers();
    }

    private void seedCorpus() {
        if (corpusRepository.count() > 0) {
            log.info("语料已存在 {} 条，跳过播种", corpusRepository.count());
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        List<Corpus> batch = new ArrayList<>();
        int seq = 0;
        for (KnowledgeBase.Pair p : kb.getPairs()) {
            seq++;
            Corpus c = new Corpus();
            c.setCode(String.format("GF%04d", seq));
            c.setModern(p.getModern());
            c.setAncient(p.getAncient());
            c.setSource(p.getSource());
            c.setCategories(p.getCategories());
            c.setTags(p.getTags());
            c.setPlatform(p.getPlatform());
            c.setPopularity(p.isSupplement() ? "低" : "中");
            c.setEra("");
            c.setEmotion("");
            c.setRhetoric("");
            c.setStyle("古风");
            c.setConfidence(p.isSupplement() ? 0.7 : 0.95);
            c.setDataSource("REAL");
            c.setViewCount(0L);
            c.setFavCount(0L);
            c.setCreatedAt(now);
            batch.add(c);
        }
        log.info("载入真实语料 {} 条", batch.size());

        try (InputStream in = new ClassPathResource("seed/corpus_ext.json").getInputStream()) {
            List<Map<String, Object>> ext = mapper.readValue(in,
                    mapper.getTypeFactory().constructCollectionType(List.class, Map.class));
            for (Map<String, Object> m : ext) {
                Corpus c = new Corpus();
                String code = str(m.get("code"));
                c.setCode("EX" + (code.isEmpty() ? Math.abs(str(m.get("modern")).hashCode()) : code));
                c.setModern(str(m.get("modern")));
                c.setAncient(str(m.get("ancient")));
                c.setSource(str(m.get("source")));
                c.setCategories(str(m.get("categories")));
                c.setTags(str(m.get("tags")));
                c.setPlatform(str(m.get("platform")));
                c.setPopularity(str(m.get("popularity")));
                c.setEra(str(m.get("era")));
                c.setEmotion(str(m.get("emotion")));
                c.setStyle(str(m.get("style")));
                Object conf = m.get("confidence");
                c.setConfidence(conf instanceof Number ? ((Number) conf).doubleValue() : 0.7);
                c.setDataSource("TEMPLATE");
                c.setViewCount(0L);
                c.setFavCount(0L);
                c.setCreatedAt(now);
                batch.add(c);
            }
            log.info("载入模板扩充语料 {} 条", ext.size());
        } catch (Exception e) {
            log.warn("扩充语料载入失败：{}", e.getMessage());
        }

        corpusRepository.saveAll(batch);
        log.info("语料播种完成，共 {} 条（REAL={}）", batch.size(),
                corpusRepository.countByDataSource("REAL"));
    }

    private void seedQuiz() {
        if (quizRepository.count() > 0) {
            return;
        }
        List<KnowledgeBase.Pair> usable = new ArrayList<>();
        for (KnowledgeBase.Pair p : kb.getPairs()) {
            if (p.getModern() != null && p.getAncient() != null
                    && !p.getModern().equals(p.getAncient())
                    && p.getModern().length() > 0 && p.getAncient().length() > 2) {
                usable.add(p);
            }
        }
        if (usable.size() < 8) {
            return;
        }
        Random random = new Random(20261017L);
        List<QuizQuestion> questions = new ArrayList<>();
        int n = Math.min(40, usable.size());

        for (int i = 0; i < n; i++) {
            KnowledgeBase.Pair p = usable.get(i);
            List<String> pool = new ArrayList<>();
            for (int k = 0; k < 3; k++) {
                KnowledgeBase.Pair other = usable.get(random.nextInt(usable.size()));
                while (other.getAncient().equals(p.getAncient())) {
                    other = usable.get(random.nextInt(usable.size()));
                }
                pool.add(other.getAncient());
            }
            pool.add(p.getAncient());
            Collections.shuffle(pool, random);
            QuizQuestion q = new QuizQuestion();
            q.setStem("「" + p.getModern() + "」更贴切的古风表达是？");
            q.setOptionA(pool.get(0));
            q.setOptionB(pool.get(1));
            q.setOptionC(pool.get(2));
            q.setOptionD(pool.get(3));
            char answer = (char) ('A' + pool.indexOf(p.getAncient()));
            q.setAnswer(String.valueOf(answer));
            q.setAnalysis("出处：" + (p.getSource() == null || p.getSource().isEmpty() ? "语料库整理" : p.getSource())
                    + "。原句「" + p.getAncient() + "」");
            q.setDifficulty(i % 3 == 0 ? "hard" : (i % 3 == 1 ? "normal" : "easy"));
            q.setCategory("古今对照");
            questions.add(q);
        }

        for (int i = 0; i < n; i++) {
            KnowledgeBase.Pair p = usable.get((i + 7) % usable.size());
            List<String> pool = new ArrayList<>();
            for (int k = 0; k < 3; k++) {
                KnowledgeBase.Pair other = usable.get(random.nextInt(usable.size()));
                while (other.getModern().equals(p.getModern())) {
                    other = usable.get(random.nextInt(usable.size()));
                }
                pool.add(other.getModern());
            }
            pool.add(p.getModern());
            Collections.shuffle(pool, random);
            QuizQuestion q = new QuizQuestion();
            q.setStem("「" + p.getAncient() + "」在网络上常被译作？");
            q.setOptionA(pool.get(0));
            q.setOptionB(pool.get(1));
            q.setOptionC(pool.get(2));
            q.setOptionD(pool.get(3));
            char answer = (char) ('A' + pool.indexOf(p.getModern()));
            q.setAnswer(String.valueOf(answer));
            q.setAnalysis("对应网络用语「" + p.getModern() + "」，出处："
                    + (p.getSource() == null || p.getSource().isEmpty() ? "语料库整理" : p.getSource()));
            q.setDifficulty(i % 2 == 0 ? "normal" : "hard");
            q.setCategory("语料溯源");
            questions.add(q);
        }
        quizRepository.saveAll(questions);
        log.info("题库播种完成，共 {} 题", questions.size());
    }

    private void seedUsers() {
        if (userRepository.count() > 0) {
            return;
        }
        userRepository.save(buildUser("admin", "admin123", "平台管理员", "ADMIN"));
        userRepository.save(buildUser("demo", "demo123", "演示同学", "USER"));
        log.info("内置账号已创建：admin/admin123（管理员）、demo/demo123（普通用户）");
    }

    private User buildUser(String username, String pwd, String nickname, String role) {
        User u = new User();
        u.setUsername(username);
        u.setPassword(passwordService.hash(pwd));
        u.setNickname(nickname);
        u.setAvatar("avatar-" + Math.abs(username.hashCode()) % 8);
        u.setRole(role);
        u.setStatus(1);
        u.setCreatedAt(LocalDateTime.now());
        u.setUpdatedAt(LocalDateTime.now());
        return u;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
