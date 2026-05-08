import { create } from "zustand";
import { requestJson } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export type ProductStatus = "draft" | "submitted" | "live" | "rejected" | "offline";

export type ProductItem = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  ownerRoleKey: string;
  name: string;
  englishName: string;
  summary: string;
  priceText: string;
  specialOfferEnabled: boolean;
  originalPriceText: string | null;
  specialPriceText: string | null;
  specialTag: string | null;
  images: string[];
  status: ProductStatus;
  rejectReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ProductListResponse = {
  items: ProductItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
};

type ProductImageUploadResponse = {
  bucket: string;
  objectKey: string;
  url: string;
};

type ProductInput = {
  name: string;
  englishName: string;
  summary: string;
  priceText: string;
  specialOfferEnabled: boolean;
  originalPriceText: string;
  specialPriceText: string;
  specialTag: string;
  images: string[];
  description: string;
};

type ProductsState = {
  items: ProductItem[];
  loading: boolean;
  initialized: boolean;
  error: string | null;
  load: () => Promise<void>;
  createProduct: (input: ProductInput) => Promise<ProductItem>;
  updateProduct: (id: string, input: ProductInput) => Promise<ProductItem>;
  uploadProductImage: (file: File) => Promise<string>;
  removeProduct: (id: string) => Promise<void>;
  submitProduct: (id: string) => Promise<ProductItem>;
  withdrawProductSubmission: (id: string) => Promise<ProductItem>;
  publishProduct: (id: string) => Promise<ProductItem>;
  unpublishProduct: (id: string) => Promise<ProductItem>;
  approveProduct: (id: string) => Promise<ProductItem>;
  rejectProduct: (id: string, reason?: string) => Promise<ProductItem>;
  reset: () => void;
};

function getAuthorizationHeaders() {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw new Error("登录状态已失效");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function getJsonAuthHeaders() {
  return {
    ...getAuthorizationHeaders(),
    "Content-Type": "application/json",
  };
}

function normalizePayload(input: ProductInput) {
  const payload: {
    name: string;
    englishName?: string;
    summary: string;
    priceText?: string;
    specialOfferEnabled: boolean;
    originalPriceText?: string;
    specialPriceText?: string;
    specialTag?: string;
    images: string[];
    description?: string;
  } = {
    name: input.name.trim(),
    summary: input.summary.trim(),
    specialOfferEnabled: input.specialOfferEnabled,
    images: input.images,
  };

  const englishName = input.englishName.trim();
  const priceText = input.priceText.trim();
  const originalPriceText = input.originalPriceText.trim();
  const specialPriceText = input.specialPriceText.trim();
  const specialTag = input.specialTag.trim();
  const description = input.description.trim();

  if (englishName) {
    payload.englishName = englishName;
  }

  if (!input.specialOfferEnabled && priceText) {
    payload.priceText = priceText;
  }

  if (input.specialOfferEnabled && originalPriceText) {
    payload.originalPriceText = originalPriceText;
  }

  if (input.specialOfferEnabled && specialPriceText) {
    payload.specialPriceText = specialPriceText;
  }

  if (input.specialOfferEnabled && specialTag) {
    payload.specialTag = specialTag;
  }

  if (description) {
    payload.description = description;
  }

  return payload;
}

export const useProductsStore = create<ProductsState>((set) => ({
  items: [],
  loading: false,
  initialized: false,
  error: null,
  load: async () => {
    set({ loading: true });

    try {
      const payload = await requestJson<ProductListResponse>("/api/products?page=1&limit=100", {
        headers: {
          Authorization: getAuthorizationHeaders().Authorization,
        },
      });

      set({
        items: payload.items,
        loading: false,
        initialized: true,
        error: null,
      });
    } catch (error) {
      set({
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : "加载商品失败",
      });
    }
  },
  createProduct: async (input) => {
    const item = await requestJson<ProductItem>("/api/products", {
      method: "POST",
      headers: getJsonAuthHeaders(),
      body: JSON.stringify(normalizePayload(input)),
    });

    set((state) => ({
      items: [item, ...state.items],
      error: null,
    }));

    return item;
  },
  updateProduct: async (id, input) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}`, {
      method: "PATCH",
      headers: getJsonAuthHeaders(),
      body: JSON.stringify(normalizePayload(input)),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  uploadProductImage: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    const payload = await requestJson<ProductImageUploadResponse>("/api/products/upload-image", {
      method: "POST",
      headers: getAuthorizationHeaders(),
      body: formData,
    });

    return payload.url;
  },
  removeProduct: async (id) => {
    await requestJson<{ success: true }>(`/api/products/${id}`, {
      method: "DELETE",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      error: null,
    }));
  },
  submitProduct: async (id) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/submit`, {
      method: "POST",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  withdrawProductSubmission: async (id) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/withdraw`, {
      method: "POST",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  publishProduct: async (id) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/publish`, {
      method: "POST",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  unpublishProduct: async (id) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/unpublish`, {
      method: "POST",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  approveProduct: async (id) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/approve`, {
      method: "POST",
      headers: getAuthorizationHeaders(),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  rejectProduct: async (id, reason) => {
    const item = await requestJson<ProductItem>(`/api/products/${id}/reject`, {
      method: "POST",
      headers: getJsonAuthHeaders(),
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    });

    set((state) => ({
      items: state.items.map((current) => (current.id === id ? item : current)),
      error: null,
    }));

    return item;
  },
  reset: () => {
    set({
      items: [],
      loading: false,
      initialized: false,
      error: null,
    });
  },
}));
