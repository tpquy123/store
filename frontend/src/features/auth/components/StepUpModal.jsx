import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "../state/auth.store";

// ────────────────────────────────────────────────────────────────
//  OTP Input — 6 ô nhập số riêng biệt với auto-focus
// ────────────────────────────────────────────────────────────────
const OTPInput = ({ value, onChange, disabled, hasError }) => {
  const inputRefs = useRef([]);

  const handleChange = (index, e) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const newValue = value.split("");
    newValue[index] = char;
    const joined = newValue.join("").padEnd(6, " ").slice(0, 6);
    onChange(joined.trimEnd());

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
    e.preventDefault();
  };

  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", margin: "24px 0" }}>
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => (inputRefs.current[index] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[index] || ""}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          style={{
            width: "48px",
            height: "56px",
            textAlign: "center",
            fontSize: "22px",
            fontWeight: "700",
            fontFamily: "'Inter', monospace",
            border: `2px solid ${hasError ? "#ef4444" : value[index] ? "#6366f1" : "#e5e7eb"}`,
            borderRadius: "12px",
            outline: "none",
            background: hasError ? "#fef2f2" : value[index] ? "#eef2ff" : "#f9fafb",
            color: hasError ? "#dc2626" : "#1e1b4b",
            transition: "all 0.2s ease",
            cursor: disabled ? "not-allowed" : "text",
            boxShadow: value[index] && !hasError ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
          }}
        />
      ))}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
//  Countdown Timer
// ────────────────────────────────────────────────────────────────
const CountdownTimer = ({ expiresAt, onExpired }) => {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const computeLeft = () => {
      if (!expiresAt) return 0;
      const diff = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      return diff;
    };

    setSecondsLeft(computeLeft());
    const interval = setInterval(() => {
      const left = computeLeft();
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isLow = secondsLeft < 60;

  return (
    <span style={{ color: isLow ? "#ef4444" : "#6b7280", fontWeight: isLow ? "600" : "400", fontSize: "14px" }}>
      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
    </span>
  );
};

// ────────────────────────────────────────────────────────────────
//  StepUpModal — Modal OTP chính
// ────────────────────────────────────────────────────────────────
const StepUpModal = ({ isOpen, onSuccess, onCancel }) => {
  const { stepUpState, verifyStepUp, clearStepUp, requestStepUp } = useAuthStore();
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [shakeKey, setShakeKey] = useState(0); // trigger shake animation

  // Reset khi modal mở
  useEffect(() => {
    if (isOpen) {
      setOtp("");
      setError("");
      setAttemptsLeft(null);
      setIsExpired(false);
      setResendCooldown(60); // 60s cooldown ban đầu
    }
  }, [isOpen]);

  // Countdown resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(async () => {
    if (otp.replace(/\s/g, "").length < 6) {
      setError("Vui lòng nhập đủ 6 chữ số");
      return;
    }

    setIsVerifying(true);
    setError("");

    const result = await verifyStepUp(otp.replace(/\s/g, ""));
    setIsVerifying(false);

    if (result.success) {
      onSuccess?.(result.stepUpToken);
    } else {
      setError(result.message || "Mã OTP không chính xác");
      setAttemptsLeft(result.attemptsLeft);
      setShakeKey((k) => k + 1);
      setOtp("");
    }
  }, [otp, verifyStepUp, onSuccess]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;
    const result = await requestStepUp(stepUpState.targetAction);
    if (result.success) {
      setResendCooldown(60);
      setError("");
      setOtp("");
      setIsExpired(false);
    } else {
      setError(result.message || "Không thể gửi lại OTP");
    }
  }, [resendCooldown, requestStepUp, stepUpState.targetAction]);

  const handleCancel = () => {
    clearStepUp();
    onCancel?.();
  };

  // Auto-submit khi nhập đủ 6 số
  useEffect(() => {
    if (otp.replace(/\s/g, "").length === 6 && !isVerifying && !error) {
      handleVerify();
    }
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 9998,
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          background: "#fff",
          borderRadius: "20px",
          padding: "40px 36px 32px",
          width: "min(420px, 92vw)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)",
          animation: "slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "60px",
              height: "60px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: "16px",
              fontSize: "28px",
              boxShadow: "0 8px 20px rgba(99,102,241,0.35)",
            }}
          >
            🔐
          </div>
        </div>

        {/* Title */}
        <h2
          style={{
            textAlign: "center",
            fontSize: "20px",
            fontWeight: "700",
            color: "#1e1b4b",
            margin: "0 0 8px",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Xác Nhận Danh Tính
        </h2>

        {/* Masked contact */}
        <p
          style={{
            textAlign: "center",
            fontSize: "14px",
            color: "#6b7280",
            margin: "0 0 4px",
          }}
        >
          Mã xác nhận đã được gửi đến
        </p>
        <p
          style={{
            textAlign: "center",
            fontSize: "15px",
            fontWeight: "600",
            color: "#4f46e5",
            margin: "0 0 4px",
          }}
        >
          {stepUpState.maskedContact || "địa chỉ liên hệ của bạn"}
        </p>

        {/* Countdown */}
        <p style={{ textAlign: "center", fontSize: "13px", color: "#9ca3af", margin: "0 0 4px" }}>
          Mã hết hạn sau{" "}
          <CountdownTimer expiresAt={stepUpState.expiresAt} onExpired={() => setIsExpired(true)} />
        </p>

        {/* OTP Input with shake animation */}
        <div
          key={shakeKey}
          style={{
            animation: shakeKey ? "shake 0.4s ease" : "none",
          }}
        >
          <OTPInput
            value={otp}
            onChange={setOtp}
            disabled={isVerifying || isExpired}
            hasError={Boolean(error)}
          />
        </div>

        {/* Error message */}
        {error && (
          <p
            style={{
              textAlign: "center",
              color: "#dc2626",
              fontSize: "13px",
              margin: "-8px 0 12px",
              fontWeight: "500",
            }}
          >
            {error}
            {attemptsLeft !== null && attemptsLeft > 0 && (
              <span style={{ color: "#f59e0b" }}> ({attemptsLeft} lần còn lại)</span>
            )}
          </p>
        )}

        {isExpired && (
          <p style={{ textAlign: "center", color: "#f59e0b", fontSize: "13px", margin: "-8px 0 12px" }}>
            Mã OTP đã hết hạn. Vui lòng gửi lại.
          </p>
        )}

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={isVerifying || otp.replace(/\s/g, "").length < 6 || isExpired}
          style={{
            width: "100%",
            padding: "14px",
            background:
              isVerifying || otp.replace(/\s/g, "").length < 6 || isExpired
                ? "#e5e7eb"
                : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: isVerifying || otp.replace(/\s/g, "").length < 6 || isExpired ? "#9ca3af" : "#fff",
            border: "none",
            borderRadius: "12px",
            fontSize: "15px",
            fontWeight: "600",
            cursor:
              isVerifying || otp.replace(/\s/g, "").length < 6 || isExpired ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            marginBottom: "12px",
            fontFamily: "'Inter', sans-serif",
            boxShadow:
              isVerifying || otp.replace(/\s/g, "").length < 6 || isExpired
                ? "none"
                : "0 4px 12px rgba(99,102,241,0.35)",
          }}
        >
          {isVerifying ? "Đang xác minh..." : "Xác Nhận"}
        </button>

        {/* Resend link */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            style={{
              background: "none",
              border: "none",
              cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
              color: resendCooldown > 0 ? "#9ca3af" : "#6366f1",
              fontSize: "13px",
              fontWeight: "500",
              padding: "4px 8px",
              borderRadius: "6px",
              textDecoration: resendCooldown > 0 ? "none" : "underline",
            }}
          >
            {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : "Gửi lại mã OTP"}
          </button>
          <span style={{ color: "#d1d5db", margin: "0 8px" }}>·</span>
          <button
            onClick={handleCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              fontSize: "13px",
              padding: "4px 8px",
            }}
          >
            Hủy
          </button>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { 
          from { opacity: 0; transform: translate(-50%, calc(-50% + 20px)); } 
          to { opacity: 1; transform: translate(-50%, -50%); } 
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </>
  );
};

export default StepUpModal;
