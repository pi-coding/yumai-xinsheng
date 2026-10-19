package com.yumai.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

import javax.validation.ConstraintViolation;
import javax.validation.ConstraintViolationException;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public ApiResult<Void> onBiz(BizException e) {
        return ApiResult.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ApiResult<Void> onValid(BindException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("；"));
        return ApiResult.fail(400, msg.isEmpty() ? "参数校验失败" : msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ApiResult<Void> onConstraint(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.joining("；"));
        return ApiResult.fail(400, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ApiResult<Void> onUnreadable(HttpMessageNotReadableException e) {
        return ApiResult.fail(400, "请求体格式不正确");
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ApiResult<Void> onMethod(HttpRequestMethodNotSupportedException e) {
        return ApiResult.fail(405, "不支持该请求方法");
    }

    @ExceptionHandler(NoHandlerFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResult<Void> onNotFound(NoHandlerFoundException e) {
        return ApiResult.fail(404, "接口不存在");
    }

    @ExceptionHandler(Exception.class)
    public ApiResult<Void> onOther(Exception e) {
        log.error("未处理异常", e);
        return ApiResult.fail(500, "服务器内部错误：" + e.getClass().getSimpleName());
    }
}
