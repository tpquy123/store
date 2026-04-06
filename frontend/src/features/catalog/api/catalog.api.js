import { api } from "@/shared/lib/http/httpClient";

export const reviewAPI = {
  canReview: (productId) => api.get(`/reviews/can-review/${productId}`),
  getUploadSignature: (resourceType = "image") =>
    api.post("/reviews/upload/signature", { resourceType }),
  getByProduct: (productId, params = {}) =>
    api.get(`/reviews/product/${productId}`, { params }),
  create: (data) => api.post("/reviews", data),
  update: (id, data) => api.put(`/reviews/${id}`, data),
  delete: (id) => api.delete(`/reviews/${id}`),
  likeReview: (id) => api.post(`/reviews/${id}/like`),
  replyToReview: (id, content) => api.post(`/reviews/${id}/reply`, { content }),
  updateAdminReply: (id, content) => api.put(`/reviews/${id}/reply`, { content }),
  toggleVisibility: (id) => api.patch(`/reviews/${id}/toggle-visibility`),
};

export const brandAPI = {
  getAll: (params) => api.get("/brands", { params }),
  getOne: (id) => api.get(`/brands/${id}`),
  create: (data) => api.post("/brands", data),
  update: (id, data) => api.put(`/brands/${id}`, data),
  delete: (id) => api.delete(`/brands/${id}`),
};

export const productTypeAPI = {
  getPublic: (params) => api.get("/product-types/public", { params }),
  getAll: (params) => api.get("/product-types", { params }),
  getOne: (id) => api.get(`/product-types/${id}`),
  create: (data) => api.post("/product-types", data),
  update: (id, data) => api.put(`/product-types/${id}`, data),
  delete: (id) => api.delete(`/product-types/${id}`),
};

export const universalProductAPI = {
  getAll: (params) => api.get("/universal-products", { params }),
  getById: (id) => api.get(`/universal-products/${id}`),
  getBySlug: (slug) => api.get(`/universal-products/${slug}`),
  create: (data) => api.post("/universal-products", data),
  update: (id, data) => api.put(`/universal-products/${id}`, data),
  delete: (id) => api.delete(`/universal-products/${id}`),
};
