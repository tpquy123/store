import { api } from "@/shared/lib/http/httpClient";

export const userAPI = {
  getAllShippers: () => api.get("/users/shippers"),
  updateProfile: (data) => api.put("/users/profile", data),
  addAddress: (data) => api.post("/users/addresses", data),
  updateAddress: (addressId, data) =>
    api.put(`/users/addresses/${addressId}`, data),
  deleteAddress: (addressId) => api.delete(`/users/addresses/${addressId}`),
  getAllEmployees: (params = {}) => api.get("/users/employees", { params }),
  getPermissionCatalog: () => api.get("/users/permissions/catalog"),
  getPermissionTemplates: () => api.get("/users/permissions/templates"),
  previewPermissionAssignments: (data) => api.post("/users/permissions/preview", data),
  createUser: (data) => api.post("/users", data),
  updateUserPermissions: (id, data) => api.put(`/users/${id}/permissions`, data),
  getUserAuthorization: (id, params = {}) =>
    api.get(`/users/${id}/authorization`, { params }),
  getUserRoleAssignments: (id) => api.get(`/users/${id}/role-assignments`),
  updateUserRoleAssignments: (id, data) =>
    api.put(`/users/${id}/role-assignments`, data),
  getUserPermissionGrants: (id) => api.get(`/users/${id}/permission-grants`),
  updateUserPermissionGrants: (id, data) =>
    api.put(`/users/${id}/permission-grants`, data),
  getUserEffectivePermissions: (id, params = {}) =>
    api.get(`/users/${id}/effective-permissions`, { params }),
  createEmployee: (data) => api.post("/users/employees", data),
  toggleEmployeeStatus: (id) =>
    api.patch(`/users/employees/${id}/toggle-status`),
  deleteEmployee: (id) => api.delete(`/users/employees/${id}`),
  updateEmployeeAvatar: (id, avatar) =>
    api.put(`/users/employees/${id}/avatar`, { avatar }),
  updateEmployee: (id, data) => api.put(`/users/employees/${id}`, data),
};
