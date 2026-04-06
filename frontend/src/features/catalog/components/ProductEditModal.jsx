// frontend/src/features/catalog/components/ProductEditModal.jsx
// Wrapper to keep API surface stable while using universal product form.

import React from "react";
import UniversalProductForm from "./UniversalProductForm";

const ProductEditModal = (props) => <UniversalProductForm {...props} />;

export default ProductEditModal;
