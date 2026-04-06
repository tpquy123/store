# TODO: Cải thiện UI Phân quyền - EmployeesPage (Plan Approved)

## ✅ Done

- [x] 1. Tạo TODO.md với các bước breakdown từ plan
- [x] 2. Thêm SCOPE_LABELS mapper cho scopeType badges (GLOBAL→Toàn cục, BRANCH→Chi nhánh, SELF→Bản thân)
- [x] 3. Cập nhật badge hiển thị sử dụng SCOPE_LABELS
- [x] 4. Cải thiện permission description display (ưu tiên VN desc, fallback formatted key)
- [x] 5. Thêm note tiếng Việt cho sensitive permissions warning ("Các quyền nhạy cảm (key kỹ thuật): ...")
- [x] 6. Test UI: Mở /admin/employees → Thêm → Bước 3 → Verify badges & text VN (scope "Toàn cục"/"Chi nhánh"/"Bản thân", note sensitive VN)
- [x] 7. Update TODO.md mark complete steps
- [ ] 8. attempt_completion

## ✅ Hoàn thành

UI /admin/employees "Thêm nhân viên mới" → Bước 3 Phân quyền:

- Scope badges: Toàn cục/Chi nhánh/Bản thân
- Sensitive warning: "Các quyền nhạy cảm (key kỹ thuật): ..."
- Permission keys: Giữ English (technical)
- All other text VN.

Task done. See TODO.md & EmployeesPage.jsx.
