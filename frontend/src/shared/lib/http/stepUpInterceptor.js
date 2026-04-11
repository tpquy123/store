/**
 * stepUpInterceptor.js — Axios response interceptor cho 403 STEP_UP_REQUIRED.
 *
 * Khi API trả về 403 với code = "STEP_UP_REQUIRED":
 * 1. Dispatch custom event "stepup:required" để trigger StepUpModal
 * 2. Tạo pending promise để retry request sau khi step-up thành công
 * 3. Nếu user cancel → reject với error STEP_UP_CANCELLED
 */

let pendingStepUpResolve = null;
let pendingStepUpReject = null;

/**
 * setupStepUpInterceptor — Đăng ký interceptor vào axios instance.
 * Gọi một lần sau khi tạo axios instance.
 *
 * @param {import("axios").AxiosInstance} axiosInstance
 */
export const setupStepUpInterceptor = (axiosInstance) => {
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const responseData = error?.response?.data;
      const status = error?.response?.status;

      // Chỉ xử lý 403 STEP_UP_REQUIRED
      if (status !== 403 || responseData?.code !== "STEP_UP_REQUIRED") {
        return Promise.reject(error);
      }

      const { action, actionGroup, sessionToken } = responseData?.data || {};
      const originalRequest = error.config;

      // Ngăn retry vô hạn — chỉ retry một lần
      if (originalRequest._stepUpRetried) {
        return Promise.reject(error);
      }

      // Tạo promise để đợi kết quả step-up
      const stepUpPromise = new Promise((resolve, reject) => {
        pendingStepUpResolve = resolve;
        pendingStepUpReject = reject;
      });

      // Dispatch event để StepUpModal hoặc global handler bắt
      window.dispatchEvent(
        new CustomEvent("stepup:required", {
          detail: {
            action,
            actionGroup,
            sessionToken,
            originalUrl: originalRequest.url,
            onStepUpSuccess: (stepUpToken) => {
              if (pendingStepUpResolve) {
                pendingStepUpResolve(stepUpToken);
                pendingStepUpResolve = null;
                pendingStepUpReject = null;
              }
            },
            onStepUpCancel: () => {
              if (pendingStepUpReject) {
                pendingStepUpReject(
                  Object.assign(new Error("Step-up authentication was cancelled"), {
                    code: "STEP_UP_CANCELLED",
                    isStepUpCancelled: true,
                  })
                );
                pendingStepUpResolve = null;
                pendingStepUpReject = null;
              }
            },
          },
        })
      );

      try {
        // Đợi step-up token từ StepUpModal
        const stepUpToken = await stepUpPromise;

        // Retry original request với X-Step-Up-Token header
        originalRequest._stepUpRetried = true;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers["X-Step-Up-Token"] = stepUpToken;

        return axiosInstance(originalRequest);
      } catch (stepUpError) {
        // User cancelled hoặc step-up failed → propagate error
        return Promise.reject(stepUpError);
      }
    }
  );
};

export default setupStepUpInterceptor;
