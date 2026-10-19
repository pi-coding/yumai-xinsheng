package com.yumai.service;

import com.yumai.common.BizException;
import com.yumai.entity.BookFav;
import com.yumai.repository.BookFavRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 古籍收藏（书目级）——供小程序端「我的收藏 · 书库」使用。
 *
 * <p>与 {@link FavoriteService} 的区别：那边的收藏对象是语料行（corpus_id），
 * 这里的收藏对象是书库 60 部里的书名。小程序未登录时同一份收藏存在本地
 * （<code>ymxs_favBooks</code>），登录后由前端做一次合并，服务端不做隐式迁移。</p>
 */
@Service
public class BookFavService {

    private final BookFavRepository repo;
    private final KnowledgeBase kb;

    public BookFavService(BookFavRepository repo, KnowledgeBase kb) {
        this.repo = repo;
        this.kb = kb;
    }

    /** 切换收藏状态，返回最新状态与总数。 */
    @Transactional
    public Map<String, Object> toggle(Long userId, String bookName) {
        String name = requireBook(bookName);
        boolean fav;
        Optional<BookFav> old = repo.findByUserIdAndBookName(userId, name);
        if (old.isPresent()) {
            repo.delete(old.get());
            fav = false;
        } else {
            BookFav f = new BookFav();
            f.setUserId(userId);
            f.setBookName(name);
            f.setCreatedAt(LocalDateTime.now());
            repo.save(f);
            fav = true;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bookName", name);
        m.put("favorited", fav);
        m.put("count", repo.countByUserId(userId));
        return m;
    }

    /** 收藏的书名清单（新收藏在前），前端直接拿去与本地书架求并集。 */
    public Map<String, Object> list(Long userId) {
        List<BookFav> rows = repo.findByUserIdOrderByIdDesc(userId);
        List<String> names = new ArrayList<>();
        List<Map<String, Object>> items = new ArrayList<>();
        for (BookFav f : rows) {
            names.add(f.getBookName());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("bookName", f.getBookName());
            m.put("createdAt", f.getCreatedAt());
            items.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", names.size());
        out.put("names", names);
        out.put("items", items);
        return out;
    }

    public boolean isFavorited(Long userId, String bookName) {
        return repo.existsByUserIdAndBookName(userId, bookName);
    }

    public long count(Long userId) {
        return repo.countByUserId(userId);
    }

    /** 批量同步：把本地书架一次性推到服务端（只加不删，避免误删）。 */
    @Transactional
    public Map<String, Object> merge(Long userId, List<String> names) {
        int added = 0;
        if (names != null) {
            for (String raw : names) {
                String name;
                try {
                    name = requireBook(raw);
                } catch (RuntimeException e) {
                    continue; // 本地书架里可能有已改名的旧条目，跳过而不是整批失败
                }
                if (!repo.existsByUserIdAndBookName(userId, name)) {
                    BookFav f = new BookFav();
                    f.setUserId(userId);
                    f.setBookName(name);
                    f.setCreatedAt(LocalDateTime.now());
                    repo.save(f);
                    added++;
                }
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("added", added);
        m.put("count", repo.countByUserId(userId));
        return m;
    }

    private String requireBook(String bookName) {
        String name = bookName == null ? "" : bookName.trim();
        if (name.isEmpty()) {
            throw new BizException(400, "书名不能为空");
        }
        for (KnowledgeBase.Book b : kb.getBooks()) {
            if (b.getName().equals(name)) {
                return name;
            }
        }
        throw BizException.notFound("书目不存在：" + name);
    }
}
