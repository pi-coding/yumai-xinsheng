package com.yumai.controller;

import com.yumai.common.ApiResult;
import com.yumai.entity.AdaptLog;
import com.yumai.repository.AdaptLogRepository;
import com.yumai.security.RequireAuth;
import com.yumai.security.UserContext;
import com.yumai.service.AdaptService;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/adapt")
public class AdaptController {

    private final AdaptService adaptService;
    private final AdaptLogRepository adaptLogRepository;
    private final UserContext userContext;

    public AdaptController(AdaptService adaptService, AdaptLogRepository adaptLogRepository, UserContext userContext) {
        this.adaptService = adaptService;
        this.adaptLogRepository = adaptLogRepository;
        this.userContext = userContext;
    }

    @PostMapping
    public ApiResult<Map<String, Object>> adapt(@Valid @RequestBody AdaptReq req) {
        Map<String, Object> data = adaptService.adaptCached(req.getText(), req.getMode(),
                req.getContext(), req.getTone(), req.getForm(), userContext.userId());
        return ApiResult.ok(data);
    }

    @GetMapping("/options")
    public ApiResult<Map<String, Object>> options() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("contexts", Arrays.asList("日常", "职场", "学习", "情感", "社交"));
        m.put("tones", Arrays.asList("自然", "俏皮", "庄重", "深情", "豪迈", "温婉"));
        m.put("m2cForms", Arrays.asList("原词使用", "诗词语素拼接", "网络改编", "文言句式"));
        m.put("c2mForms", Arrays.asList("通俗转写", "网络改编", "文言句式"));
        m.put("examples", Arrays.asList(
                "今天上班好困啊，不想干活只想摸鱼",
                "这个方案太赞了，我直接给跪了",
                "我emo了",
                "世间无限丹青手，一片伤心画不成"));
        return ApiResult.ok(m);
    }

    @RequireAuth
    @GetMapping("/history")
    public ApiResult<List<Map<String, Object>>> history(@RequestParam(defaultValue = "10") int n) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (AdaptLog log : adaptLogRepository.findTop10ByUserIdOrderByIdDesc(userContext.requireUserId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("input", log.getInputText());
            m.put("output", log.getOutputText());
            m.put("mode", log.getMode());
            m.put("context", log.getContext());
            m.put("tone", log.getTone());
            m.put("form", log.getForm());
            m.put("at", log.getCreatedAt());
            list.add(m);
            if (list.size() >= Math.min(30, Math.max(1, n))) {
                break;
            }
        }
        return ApiResult.ok(list);
    }

    public static class AdaptReq {
        @NotBlank(message = "请输入要改编的内容")
        private String text;

        private String mode = "m2c";
        private String context = "日常";
        private String tone = "自然";
        private String form = "原词使用";

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public String getContext() {
            return context;
        }

        public void setContext(String context) {
            this.context = context;
        }

        public String getTone() {
            return tone;
        }

        public void setTone(String tone) {
            this.tone = tone;
        }

        public String getForm() {
            return form;
        }

        public void setForm(String form) {
            this.form = form;
        }
    }
}
