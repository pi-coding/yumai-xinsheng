package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.common.RedisKeys;
import com.yumai.entity.QuizQuestion;
import com.yumai.entity.QuizRecord;
import com.yumai.entity.User;
import com.yumai.repository.QuizQuestionRepository;
import com.yumai.repository.QuizRecordRepository;
import com.yumai.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class QuizService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

    private final QuizQuestionRepository questionRepository;
    private final QuizRecordRepository recordRepository;
    private final UserRepository userRepository;
    private final RedisService redis;

    public QuizService(QuizQuestionRepository questionRepository, QuizRecordRepository recordRepository,
                       UserRepository userRepository, RedisService redis) {
        this.questionRepository = questionRepository;
        this.recordRepository = recordRepository;
        this.userRepository = userRepository;
        this.redis = redis;
    }

    /** 抽题：不下发答案，只给题干与选项 */
    public List<Map<String, Object>> start(int count) {
        int n = Math.min(20, Math.max(5, count));
        Pageable limit = PageRequest.of(0, n);
        List<QuizQuestion> questions = questionRepository.randomQuestions(limit);
        if (questions.isEmpty()) {
            throw new BizException(404, "题库为空，请先初始化数据");
        }
        List<Map<String, Object>> list = new ArrayList<>();
        for (QuizQuestion q : questions) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.getId());
            m.put("stem", q.getStem());
            m.put("category", q.getCategory());
            m.put("difficulty", q.getDifficulty());
            List<Map<String, String>> options = new ArrayList<>();
            options.add(option("A", q.getOptionA()));
            options.add(option("B", q.getOptionB()));
            options.add(option("C", q.getOptionC()));
            options.add(option("D", q.getOptionD()));
            m.put("options", options);
            list.add(m);
        }
        return list;
    }

    @Transactional
    public Map<String, Object> submit(Long userId, List<AnswerItem> answers, long durationMs) {
        if (answers == null || answers.isEmpty()) {
            throw new BizException(400, "请先作答");
        }
        List<Map<String, Object>> details = new ArrayList<>();
        int correct = 0;
        for (AnswerItem a : answers) {
            QuizQuestion q = questionRepository.findById(a.getId()).orElse(null);
            if (q == null) {
                continue;
            }
            boolean ok = q.getAnswer() != null && q.getAnswer().equalsIgnoreCase(a.getChoice());
            if (ok) {
                correct++;
            }
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", q.getId());
            d.put("stem", q.getStem());
            d.put("yourChoice", a.getChoice());
            d.put("answer", q.getAnswer());
            d.put("correct", ok);
            d.put("analysis", q.getAnalysis());
            details.add(d);
        }
        int total = details.size();
        if (total == 0) {
            throw new BizException(400, "提交的题目不存在");
        }
        int score = (int) Math.round(correct * 100.0 / total);

        QuizRecord record = new QuizRecord();
        record.setUserId(userId);
        record.setTotal(total);
        record.setCorrect(correct);
        record.setScore(score);
        record.setDurationMs(durationMs);
        record.setCreatedAt(LocalDateTime.now());
        recordRepository.save(record);

        String day = LocalDate.now().format(DAY);
        String key = RedisKeys.quizRank(day);
        Double old = redis.zscore(key, String.valueOf(userId));
        if (old == null || score > old) {
            redis.zadd(key, String.valueOf(userId), score);
        }
        redis.expire(key, 3 * 24 * 3600L);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("total", total);
        data.put("correct", correct);
        data.put("score", score);
        data.put("details", details);
        Long rank = redis.zrankRev(key, String.valueOf(userId));
        data.put("rank", rank == null ? null : rank + 1);
        return data;
    }

    /** 今日榜单，含昵称 */
    public List<Map<String, Object>> rank(String day, int n) {
        int top = Math.min(50, Math.max(1, n));
        String d = (day == null || day.isEmpty()) ? LocalDate.now().format(DAY) : day;
        List<ZSetOperations.TypedTuple<String>> tuples = redis.zrevrange(RedisKeys.quizRank(d), top);
        List<Map<String, Object>> list = new ArrayList<>();
        if (tuples.isEmpty()) {
            return list;
        }
        List<Long> ids = new ArrayList<>();
        for (ZSetOperations.TypedTuple<String> t : tuples) {
            Long id = safeId(t.getValue());
            if (id != null) {
                ids.add(id);
            }
        }
        Map<Long, User> users = new HashMap<>();
        for (User u : userRepository.findAllById(ids)) {
            users.put(u.getId(), u);
        }
        int i = 1;
        for (ZSetOperations.TypedTuple<String> t : tuples) {
            Long uid = safeId(t.getValue());
            if (uid == null) {
                continue;
            }
            User u = users.get(uid);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rank", i++);
            m.put("userId", uid);
            m.put("nickname", u == null ? "匿名学子" : u.getNickname());
            m.put("score", t.getScore() == null ? 0 : t.getScore().intValue());
            list.add(m);
        }
        return list;
    }

    public List<Map<String, Object>> myRecords(Long userId, int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (QuizRecord r : recordRepository.findByUserIdOrderByIdDesc(userId, PageRequest.of(0, Math.min(20, n)))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("total", r.getTotal());
            m.put("correct", r.getCorrect());
            m.put("score", r.getScore());
            m.put("at", r.getCreatedAt());
            list.add(m);
        }
        return list;
    }

    /** 容忍历史脏数据：早期版本用 JSON 序列化写入 ZSet，member 带引号 */
    private static Long safeId(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return Long.parseLong(raw.replace("\"", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Map<String, String> option(String key, String text) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("text", text == null ? "" : text);
        return m;
    }

    public static class AnswerItem {
        private Long id;
        private String choice;

        public Long getId() {
            return id;
        }

        public void setId(Long id) {
            this.id = id;
        }

        public String getChoice() {
            return choice;
        }

        public void setChoice(String choice) {
            this.choice = choice;
        }
    }
}
