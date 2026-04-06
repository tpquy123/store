import { authorize } from "./authorize.js";

export const checkPermission = (permission, options = {}) => {
  return authorize(permission, options);
};

export default checkPermission;
