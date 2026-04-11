// FILE: src/components/shared/AddressFormDialog.jsx
// Reusable component for add/edit address form (ProfilePage logic - NO district)

import React, { useState, useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/shared/ui/dialog";
import { provinces } from "@/shared/constants/provinces";

const AddressFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
  editingAddress = null,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState({
    fullName: "",
    phoneNumber: "",
    province: "",
    ward: "",
    detailAddress: "",
    isDefault: false,
  });

  // === INIT FORM KHI MỞ DIALOG ===
  useEffect(() => {
    if (editingAddress) {
      setFormData({
        fullName: editingAddress.fullName || "",
        phoneNumber: editingAddress.phoneNumber || "",
        province: editingAddress.province || "",
        ward: editingAddress.ward || "",
        detailAddress: editingAddress.detailAddress || "",
        isDefault: editingAddress.isDefault || false,
      });
    } else {
      resetForm();
    }
  }, [editingAddress, open]);

  const handleChange = (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData, editingAddress?._id);
  };

  const resetForm = () => {
    setFormData({
      fullName: "",
      phoneNumber: "",
      province: "",
      ward: "",
      detailAddress: "",
      isDefault: false,
    });
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingAddress ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ mới"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ và tên</Label>
              <Input
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Số điện thoại</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="province">Tỉnh/Thành phố</Label>
              <select
                id="province"
                name="province"
                value={formData.province}
                onChange={handleChange}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Chọn tỉnh/thành phố</option>
                {!provinces.includes(formData.province) && formData.province ? (
                  <option value={formData.province}>{formData.province}</option>
                ) : null}
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ward">Phường/Xã</Label>
              <Input
                id="ward"
                name="ward"
                value={formData.ward}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="detailAddress">Địa chỉ cụ thể</Label>
            <Input
              id="detailAddress"
              name="detailAddress"
              value={formData.detailAddress}
              onChange={handleChange}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isDefault"
              name="isDefault"
              checked={formData.isDefault}
              onChange={handleChange}
              className="w-4 h-4"
            />
            <Label htmlFor="isDefault">Đặt làm địa chỉ mặc định</Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Đang cập nhật..."
                : editingAddress
                ? "Cập nhật"
                : "Thêm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddressFormDialog;
