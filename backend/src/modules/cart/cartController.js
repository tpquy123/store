import Cart from "./Cart.js";
import UniversalProduct, { UniversalVariant } from "../product/UniversalProduct.js";
import {
  canPurchaseForProductStatus,
  normalizeProductStatus,
} from "../product/productPricingConfig.js";
import { resolveVariantPricingSnapshot } from "../product/productPricingService.js";

const getModelsByType = () => ({
  Product: UniversalProduct,
  Variant: UniversalVariant,
});

const getAvailabilityMessage = (status) => {
  switch (normalizeProductStatus(status)) {
    case "COMING_SOON":
      return "San pham sap mo ban";
    case "OUT_OF_STOCK":
      return "San pham tam het hang";
    case "PRE_ORDER":
      return "San pham chua mo dat truoc";
    case "DISCONTINUED":
      return "San pham da ngung kinh doanh";
    default:
      return "San pham hien khong kha dung";
  }
};

const buildCartItemResponse = ({ cartItem, product, variant }) => {
  const snapshot = resolveVariantPricingSnapshot(variant);
  const normalizedStatus = normalizeProductStatus(product?.status);

  return {
    _id: cartItem._id,
    productId: product._id,
    variantId: variant._id,
    productType: cartItem.productType,
    productName: product.name,
    productModel: product.model,
    productSlug: product.slug || product.baseSlug,
    variantSlug: variant.slug,
    variantSku: variant.sku,
    variantColor: variant.color,
    variantStorage: variant.attributes?.storage || variant.storage || "",
    variantName: variant.variantName,
    variantConnectivity: variant.attributes?.connectivity || variant.connectivity || "",
    variantCpuGpu: variant.attributes?.cpuGpu || variant.cpuGpu || "",
    variantRam: variant.attributes?.ram || variant.ram || "",
    quantity: cartItem.quantity,
    price: snapshot.sellingPrice,
    originalPrice: snapshot.originalPrice,
    basePrice: snapshot.basePrice,
    costPrice: snapshot.costPrice,
    stock: variant.stock,
    canPurchase: canPurchaseForProductStatus(normalizedStatus),
    availabilityState: normalizedStatus,
    images: variant.images || [],
    productImages: product.featuredImages || [],
  };
};

const populateCartItems = async (cart) => {
  const populatedItems = [];

  for (const item of Array.isArray(cart?.items) ? cart.items : []) {
    const models = getModelsByType(item.productType);
    if (!models) continue;

    const variant = await models.Variant.findById(item.variantId).lean();
    if (!variant) continue;

    const product = await models.Product.findById(variant.productId).lean();
    if (!product) continue;

    populatedItems.push(
      buildCartItemResponse({
        cartItem: item,
        product,
        variant,
      })
    );
  }

  return populatedItems;
};

export const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ customerId: req.user._id, items: [] });
    }

    const formattedItems = await populateCartItems(cart);

    res.json({
      success: true,
      data: {
        _id: cart._id,
        customerId: cart.customerId,
        items: formattedItems,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getCartCount = async (req, res) => {
  try {
    const cart = await Cart.findOne({ customerId: req.user._id }).select("items");
    const count = Array.isArray(cart?.items) ? cart.items.length : 0;

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { variantId, productType, quantity = 1 } = req.body;
    if (!variantId || !productType) {
      return res.status(400).json({
        success: false,
        message: "Can cung cap variantId va productType",
      });
    }

    const models = getModelsByType(productType);
    const variant = await models.Variant.findById(variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Bien the khong ton tai",
      });
    }

    const product = await models.Product.findById(variant.productId).lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "San pham khong ton tai",
      });
    }

    const normalizedStatus = normalizeProductStatus(product.status);
    if (!canPurchaseForProductStatus(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: getAvailabilityMessage(normalizedStatus),
      });
    }

    if (Number(variant.stock) < Number(quantity)) {
      return res.status(400).json({
        success: false,
        message: `Chi con ${variant.stock} san pham trong kho`,
      });
    }

    const snapshot = resolveVariantPricingSnapshot(variant);
    const itemData = {
      variantId: variant._id,
      productId: variant.productId,
      productType,
      quantity: Number(quantity),
      price: snapshot.sellingPrice,
      sku: variant.sku,
    };

    let cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ customerId: req.user._id, items: [itemData] });
    } else {
      const itemIndex = cart.items.findIndex(
        (item) =>
          item.variantId?.toString() === String(variantId) &&
          item.productType === productType
      );

      if (itemIndex > -1) {
        const newQuantity = Number(cart.items[itemIndex].quantity || 0) + Number(quantity);
        if (newQuantity > Number(variant.stock || 0)) {
          return res.status(400).json({
            success: false,
            message: `Chi con ${variant.stock} san pham trong kho`,
          });
        }
        cart.items[itemIndex].quantity = newQuantity;
        cart.items[itemIndex].price = snapshot.sellingPrice;
      } else {
        cart.items.push(itemData);
      }
      await cart.save();
    }

    const formattedItems = await populateCartItems(cart);

    res.json({
      success: true,
      message: "Da them vao gio hang",
      data: {
        _id: cart._id,
        items: formattedItems,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { variantId, productType, quantity } = req.body;
    if (!variantId || !productType) {
      return res.status(400).json({
        success: false,
        message: "Can cung cap variantId va productType",
      });
    }

    if (quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "So luong khong hop le",
      });
    }

    const models = getModelsByType(productType);
    const variant = await models.Variant.findById(variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Bien the khong ton tai",
      });
    }

    const product = await models.Product.findById(variant.productId).lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "San pham khong ton tai",
      });
    }

    const normalizedStatus = normalizeProductStatus(product.status);
    if (quantity > 0 && !canPurchaseForProductStatus(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: getAvailabilityMessage(normalizedStatus),
      });
    }

    if (quantity > 0 && Number(variant.stock) < Number(quantity)) {
      return res.status(400).json({
        success: false,
        message: `Chi con ${variant.stock} san pham trong kho`,
      });
    }

    const cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Gio hang khong ton tai",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.variantId?.toString() === String(variantId) &&
        item.productType === productType
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "San pham khong co trong gio hang",
      });
    }

    if (Number(quantity) === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      const snapshot = resolveVariantPricingSnapshot(variant);
      cart.items[itemIndex].quantity = Number(quantity);
      cart.items[itemIndex].price = snapshot.sellingPrice;
    }

    await cart.save();

    const formattedItems = await populateCartItems(cart);
    res.json({
      success: true,
      message: "Cap nhat gio hang thanh cong",
      data: {
        _id: cart._id,
        customerId: cart.customerId,
        items: formattedItems,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Gio hang khong ton tai",
      });
    }

    const initialLength = cart.items.length;
    cart.items = cart.items.filter((item) => {
      const itemIdStr = item._id ? item._id.toString() : "";
      const variantIdStr = item.variantId ? item.variantId.toString() : "";
      return itemIdStr !== itemId && variantIdStr !== itemId;
    });

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: "San pham khong co trong gio hang",
      });
    }

    await cart.save();
    const formattedItems = await populateCartItems(cart);

    res.json({
      success: true,
      message: "Da xoa san pham khoi gio hang",
      data: {
        _id: cart._id,
        customerId: cart.customerId,
        items: formattedItems,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Gio hang khong ton tai",
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: "Da xoa toan bo gio hang",
      data: {
        _id: cart._id,
        customerId: cart.customerId,
        items: [],
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const validateCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ customerId: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Gio hang trong",
      });
    }

    const invalidItems = [];
    const validItems = [];

    for (const item of cart.items) {
      const models = getModelsByType(item.productType);
      const variant = await models.Variant.findById(item.variantId);
      if (!variant) {
        invalidItems.push({
          itemId: item._id,
          reason: "Bien the khong ton tai",
        });
        continue;
      }

      const product = await models.Product.findById(variant.productId).lean();
      if (!product) {
        invalidItems.push({
          itemId: item._id,
          reason: "San pham khong ton tai",
        });
        continue;
      }

      const normalizedStatus = normalizeProductStatus(product.status);
      if (!canPurchaseForProductStatus(normalizedStatus)) {
        invalidItems.push({
          itemId: item._id,
          reason: getAvailabilityMessage(normalizedStatus),
        });
        continue;
      }

      if (Number(variant.stock) < Number(item.quantity)) {
        invalidItems.push({
          itemId: item._id,
          reason: `Chi con ${variant.stock} san pham trong kho`,
          availableStock: variant.stock,
        });
        continue;
      }

      const snapshot = resolveVariantPricingSnapshot(variant);
      validItems.push({
        itemId: item._id,
        variantId: variant._id,
        productId: product._id,
        productType: item.productType,
        quantity: item.quantity,
        price: snapshot.sellingPrice,
        originalPrice: snapshot.originalPrice,
        basePrice: snapshot.basePrice,
        costPrice: snapshot.costPrice,
      });
    }

    res.json({
      success: invalidItems.length === 0,
      message:
        invalidItems.length === 0
          ? "Gio hang hop le"
          : "Co san pham khong hop le trong gio hang",
      data: {
        valid: validItems,
        invalid: invalidItems,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  getCart,
  getCartCount,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  validateCart,
};
