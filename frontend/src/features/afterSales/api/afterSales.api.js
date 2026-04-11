import { api } from "@/shared/lib/http/httpClient";

export const afterSalesAPI = {
  warrantyLookup: ({ phone, imeiOrSerial, identifier } = {}) =>
    api.get("/warranty/search", {
      params: {
        ...(phone ? { phone } : {}),
        ...(imeiOrSerial || identifier
          ? { imeiOrSerial: imeiOrSerial || identifier }
          : {}),
      },
    }),
  listDevices: (params = {}) => api.get("/devices", { params }),
  getDeviceById: (id) => api.get(`/devices/${id}`),
  getDeviceHistory: (id) => api.get(`/devices/${id}/history`),
  getAvailableDevices: (params = {}) => api.get("/devices/available", { params }),
  registerDevice: (data) => api.post("/devices/register", data),
  importDevices: (data) => api.post("/devices/import", data),
  updateDeviceServiceState: (id, data) =>
    api.patch(`/devices/${id}/service-state`, data),
  listWarranties: (params = {}) => api.get("/warranty", { params }),
  getWarrantyById: (id) => api.get(`/warranty/${id}`),
  updateWarrantyStatus: (id, data) => api.patch(`/warranty/${id}/status`, data),
};

export default afterSalesAPI;
