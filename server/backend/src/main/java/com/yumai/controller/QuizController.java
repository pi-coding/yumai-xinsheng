package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.QuizService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/quiz")
public class QuizController {

    private final QuizService quizService;
    private final UserContext userContext;

    public QuizController(QuizService quizService, UserContext userContext) {
        this.quizService = quizService;
        this.userContext = userContext;
    }

    @GetMapping("/questions")
    public ApiResult<List<Map<String, Object>>> questions(@RequestParam(defaultValue = "10") int n) {
        return ApiResult.ok(quizService.start(n));
    }

    @RequireAuth
    @PostMapping("/submit")
    public ApiResult<Map<String, Object>> submit(@RequestBody SubmitReq req) {
        return ApiResult.ok("交卷成功", quizService.submit(userContext.requireUserId(),
                req.getAnswers(), req.getDurationMs() == null ? 0L : req.getDurationMs()));
    }

    @GetMapping("/rank")
    public ApiResult<List<Map<String, Object>>> rank(@RequestParam(required = false) String day,
                                                     @RequestParam(defaultValue = "10") int n) {
        return ApiResult.ok(quizService.rank(day, n));
    }

    @RequireAuth
    @GetMapping("/records")
    public ApiResult<List<Map<String, Object>>> records(@RequestParam(defaultValue = "10") int n) {
        return ApiResult.ok(quizService.myRecords(userContext.requireUserId(), n));
    }

    @GetMapping("/meta")
    public ApiResult<Map<String, Object>> meta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scoring", "每答对一题计 100/题数 分，满分 100");
        m.put("rankTtl", "Redis 日榜保留 3 天");
        m.put("defaultCount", 10);
        return ApiResult.ok(m);
    }

    public static class SubmitReq {
        private List<QuizService.AnswerItem> answers;
        private Long durationMs;

        public List<QuizService.AnswerItem> getAnswers() {
            return answers;
        }

        public void setAnswers(List<QuizService.AnswerItem> answers) {
            this.answers = answers;
        }

        public Long getDurationMs() {
            return durationMs;
        }

        public void setDurationMs(Long durationMs) {
            this.durationMs = durationMs;
        }
    }
}
