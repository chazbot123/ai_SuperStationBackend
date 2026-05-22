import { useEffect, useMemo, useState } from "react";
import "../landing/legacy-home.css";

declare global {
  interface Window {
    p5?: any;
  }
}

interface Product {
  id: string;
  name: string;
  englishName?: string;
  summary?: string;
  description?: string;
  priceText?: string;
  specialOfferEnabled?: boolean;
  category?: string;
  images: string[];
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_PUBLIC_USER_ID = "cmotrwinc0000n4u9e265uccn";

function loadP5Script() {
  return new Promise<void>((resolve, reject) => {
    if (window.p5) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-products-p5="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("p5 load failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/vendor/p5.min.js";
    script.async = true;
    script.dataset.productsP5 = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("p5 load failed")), { once: true });
    document.body.appendChild(script);
  });
}

function getPublicUserId() {
  return new URLSearchParams(window.location.search).get("userId") || DEFAULT_PUBLIC_USER_ID;
}

function buildHomeUrl() {
  const params = new URLSearchParams(window.location.search);
  params.delete("view");
  const nextQuery = params.toString();
  return nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMethod, setSortMethod] = useState<"timeDesc" | "timeAsc" | "priceDesc" | "priceAsc">("timeDesc");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    let disposed = false;
    const previousBackground = document.body.style.background;
    document.body.style.background = "var(--bg)";
    document.body.classList.remove("overlay-open");
    document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");

    let instance: { remove: () => void } | null = null;

    const bootFluidBackground = async () => {
      try {
        await loadP5Script();
        if (disposed || !window.p5 || !document.getElementById("p5-canvas-container")) return;

        instance = new window.p5((p: any) => {
          const Vector = window.p5!.Vector;
          const particles: Array<{
            pos: any;
            vel: any;
            acc: any;
            maxSpeed: number;
            color: any;
            size: number;
            update: () => void;
            display: () => void;
          }> = [];
          const numParticles = 800;
          const noiseScale = 0.01;
          let customSeed = 0;
          let interactionX = -1000;
          let interactionY = -1000;

          class Particle {
            pos: any;
            vel: any;
            acc: any;
            maxSpeed: number;
            color: any;
            size: number;

            constructor() {
              this.pos = p.createVector(p.random(p.width), p.random(p.height));
              this.vel = p.createVector(0, 0);
              this.acc = p.createVector(0, 0);
              this.maxSpeed = p.random(0.5, 1.5);
              this.color = p.random() > 0.5 ? p.color(166, 83, 63, 40) : p.color(212, 139, 118, 40);
              this.size = p.random(1, 3);
            }

            update() {
              const angle = p.noise(this.pos.x * noiseScale, this.pos.y * noiseScale, p.frameCount * 0.002) * p.TWO_PI * 2;
              const flowForce = Vector.fromAngle(angle);
              flowForce.mult(0.1);

              const d = p.dist(this.pos.x, this.pos.y, interactionX, interactionY - window.scrollY);
              if (d < 200) {
                const repulse = Vector.sub(this.pos, p.createVector(interactionX, interactionY - window.scrollY));
                repulse.normalize();
                repulse.mult(p.map(d, 0, 200, 0.5, 0));
                this.acc.add(repulse);
              }

              this.acc.add(flowForce);
              this.vel.add(this.acc);
              this.vel.limit(this.maxSpeed);
              this.pos.add(this.vel);
              this.acc.mult(0);

              if (this.pos.x > p.width) this.pos.x = 0;
              if (this.pos.x < 0) this.pos.x = p.width;
              if (this.pos.y > p.height) this.pos.y = 0;
              if (this.pos.y < 0) this.pos.y = p.height;
            }

            display() {
              p.noStroke();
              p.fill(this.color);
              p.circle(this.pos.x, this.pos.y, this.size);
            }
          }

          p.setup = () => {
            const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
            canvas.parent("p5-canvas-container");
            customSeed = p.random(10000);
            p.noiseSeed(customSeed);
            for (let i = 0; i < numParticles; i += 1) {
              particles.push(new Particle());
            }
            p.background(249, 248, 246);
          };

          p.draw = () => {
            p.noStroke();
            p.fill(249, 248, 246, 20);
            p.rect(0, 0, p.width, p.height);

            interactionX = p.lerp(interactionX, p.mouseX, 0.1);
            interactionY = p.lerp(interactionY, p.mouseY + window.scrollY, 0.1);

            particles.forEach((particle) => {
              particle.update();
              particle.display();
            });
          };

          p.windowResized = () => {
            p.resizeCanvas(window.innerWidth, window.innerHeight);
          };
        });
      } catch (error) {
        console.error("products background bootstrap failed", error);
      }
    };

    bootFluidBackground();

    return () => {
      disposed = true;
      document.body.style.background = previousBackground;
      instance?.remove();
      const container = document.getElementById("p5-canvas-container");
      if (container) {
        container.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const fetchProducts = async () => {
      try {
        const adminResponse = await fetch("/api/products?page=1&limit=200", {
          credentials: "include",
        });

        if (adminResponse.ok) {
          const data = await adminResponse.json();
          if (!disposed) {
            setProducts(Array.isArray(data?.items) ? data.items : []);
          }
          return;
        }

        const publicUserId = getPublicUserId();
        const publicResponse = await fetch(`/api/products/public/${encodeURIComponent(publicUserId)}`);
        if (!publicResponse.ok) {
          throw new Error(`public products request failed: ${publicResponse.status}`);
        }

        const publicData = await publicResponse.json();
        if (!disposed) {
          setProducts(Array.isArray(publicData?.items) ? publicData.items : []);
        }
      } catch (error) {
        console.error("fetch products failed", error);
        if (!disposed) {
          setProducts([]);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProduct(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const parsePrice = (text?: string) => {
      const num = Number.parseFloat(String(text || "").replace(/[^0-9.]/g, ""));
      return Number.isNaN(num) ? 0 : num;
    };
    const getTimestamp = (product: Product) =>
      new Date(product.createdAt || product.updatedAt || 0).getTime();

    return [...products]
      .filter((product) => {
        if (!keyword) return true;
        return [product.name, product.category, product.summary, product.description, product.englishName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      })
      .sort((a, b) => {
        if (sortMethod === "timeDesc") return getTimestamp(b) - getTimestamp(a);
        if (sortMethod === "timeAsc") return getTimestamp(a) - getTimestamp(b);
        if (sortMethod === "priceDesc") return parsePrice(b.priceText) - parsePrice(a.priceText);
        return parsePrice(a.priceText) - parsePrice(b.priceText);
      });
  }, [products, search, sortMethod]);

  return (
    <>
      <div id="p5-canvas-container"></div>
      <div className="page" style={{ width: "min(1560px, calc(100vw - 64px))", margin: "0 auto", paddingBottom: "120px" }}>
        <header className="topbar compact" id="topbar" style={{ position: "sticky", marginBottom: "40px" }}>
          <div
            className="brand"
            onClick={() => {
              window.location.href = buildHomeUrl();
            }}
            style={{ cursor: "pointer" }}
          >
            <svg className="brand-logo" viewBox="0 0 280 64" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(0, 2) scale(0.6)">
                <path d="M 50,0 C 20,0 0,20 0,50 C 0,80 20,100 50,100 C 70,100 90,85 100,70 C 80,90 60,95 40,85 C 15,75 10,40 20,20 C 30,5 50,0 70,5 C 85,10 95,20 100,30 C 85,10 70,0 50,0 Z" fill="#0072bc" />
                <path d="M 25,35 C 15,50 20,70 35,85 C 50,95 70,90 85,75 C 65,90 45,85 30,70 C 15,55 20,35 35,25 C 50,15 70,20 85,30 C 70,15 45,15 25,35 Z" fill="#f29100" />
                <path d="M 35,85 C 50,100 75,95 95,75 C 90,85 75,100 50,100 C 30,100 10,85 0,65 C 5,80 20,95 35,85 Z" fill="#004a8c" />
              </g>
              <text x="75" y="32" fontFamily="sans-serif" fontSize="34" fontWeight="900" fontStyle="italic" fill="#241a14">
                志林科技
              </text>
              <text x="77" y="56" fontFamily="sans-serif" fontSize="20" fontWeight="900" fontStyle="italic" fill="#241a14" letterSpacing="1">
                CHILINTECH
              </text>
            </svg>
          </div>
          <nav className="nav">
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                window.location.href = buildHomeUrl();
              }}
            >
              返回首页
            </a>
          </nav>
          <div style={{ justifySelf: "end", fontWeight: 600, letterSpacing: "0.05em" }}>400-882-CHILIN</div>
        </header>

        <section className="section" style={{ paddingTop: "10px" }}>
          <div className="section-head reveal in-view" style={{ marginBottom: "28px", opacity: 1, transform: "none" }}>
            <h2>全部产品</h2>
            <p>展示产品管理中的全部可访问产品，支持搜索、时间排序和价格排序，视觉风格与主页面保持一致。</p>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "28px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <input
              type="text"
              placeholder="搜索产品名称、类别..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{
                minWidth: "280px",
                padding: "14px 18px",
                borderRadius: "999px",
                border: "1px solid rgba(24, 19, 15, 0.1)",
                background: "rgba(255,255,255,.58)",
                boxShadow: "var(--shadow-soft)",
                fontSize: "14px",
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <select
              value={sortMethod}
              onChange={(event) => setSortMethod(event.target.value as typeof sortMethod)}
              style={{
                padding: "14px 18px",
                borderRadius: "999px",
                border: "1px solid rgba(24, 19, 15, 0.1)",
                background: "rgba(255,255,255,.58)",
                boxShadow: "var(--shadow-soft)",
                fontSize: "14px",
                color: "var(--ink)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="timeDesc">按时间最新</option>
              <option value="timeAsc">按时间最早</option>
              <option value="priceAsc">按价格从低到高</option>
              <option value="priceDesc">按价格从高到低</option>
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "100px 0", color: "var(--muted)" }}>加载中...</div>
          ) : (
            <div
              className="portfolio-grid"
              style={{
                opacity: 1,
                transform: "none",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "32px 24px",
              }}
            >
              {filteredProducts.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "100px 0", color: "var(--muted)" }}>
                  暂无可展示产品
                </div>
              ) : (
                filteredProducts.map((product, index) => {
                  const primaryImage = product.images?.[0] || "/assets/images/landing/img_8.jpeg";
                  const categoryLabel = String(product.category || "").trim();

                  return (
                    <article
                      key={product.id || index}
                      className="p-item products-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedProduct(product)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedProduct(product);
                        }
                      }}
                      style={{ opacity: 1, transform: "none", position: "relative" }}
                    >
                      <div className="p-image-wrap products-card__image-wrap">
                        <div
                          className="p-image"
                          style={{ backgroundImage: `url('${primaryImage}')`, height: "320px" }}
                        ></div>
                        <div className="products-card__image-glow"></div>
                      </div>
                      <div className="p-info products-card__info" style={{ marginTop: "16px", gap: "10px" }}>
                        <div className="products-card__meta">
                          {categoryLabel ? <span className="p-cat products-card__cat">{categoryLabel}</span> : <span className="p-cat products-card__cat">精选产品</span>}
                          <span className="products-card__hint">查看详情</span>
                        </div>
                        <h3 className="products-card__title" style={{ fontSize: "20px" }}>
                          {product.name || `产品 ${index + 1}`}
                        </h3>
                        {product.priceText ? <div className="products-card__price">{product.priceText}</div> : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
      {selectedProduct ? (
        <div
          className="products-detail-modal"
          onClick={() => setSelectedProduct(null)}
          role="presentation"
        >
          <div
            className="products-detail-modal__panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={selectedProduct.name || "产品详情"}
          >
            <button
              type="button"
              className="products-detail-modal__close"
              onClick={() => setSelectedProduct(null)}
              aria-label="关闭详情"
            >
              ×
            </button>
            <div className="products-detail-modal__media">
              <div
                className="products-detail-modal__hero"
                style={{
                  backgroundImage: `url('${selectedProduct.images?.[0] || "/assets/images/landing/img_8.jpeg"}')`,
                }}
              ></div>
            </div>
            <div className="products-detail-modal__content">
              <span className="products-detail-modal__tag">
                {String(selectedProduct.category || "").trim() || "精选产品"}
              </span>
              <h3>{selectedProduct.name || "产品详情"}</h3>
              {selectedProduct.englishName ? (
                <div className="products-detail-modal__subhead">{selectedProduct.englishName}</div>
              ) : null}
              {selectedProduct.priceText ? (
                <div className="products-detail-modal__price">{selectedProduct.priceText}</div>
              ) : null}
              <p className="products-detail-modal__description">
                {selectedProduct.description || selectedProduct.summary || "暂无详情介绍"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <style>{`
        .products-card {
          cursor: pointer;
          border-radius: 28px;
          padding: 16px 16px 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(249,246,240,0.92) 100%);
          border: 1px solid rgba(255,255,255,0.82);
          box-shadow:
            0 18px 36px rgba(53,34,18,0.08),
            0 28px 72px rgba(53,34,18,0.08),
            inset 0 1px 0 rgba(255,255,255,0.78);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          transition: transform 0.35s ease, box-shadow 0.35s ease, border-color 0.35s ease;
        }
        .products-card:hover {
          transform: translateY(-8px);
          box-shadow:
            0 24px 44px rgba(53,34,18,0.1),
            0 36px 88px rgba(53,34,18,0.12),
            inset 0 1px 0 rgba(255,255,255,0.92);
          border-color: rgba(166,83,63,0.18);
        }
        .products-card:focus-visible {
          outline: 2px solid rgba(166,83,63,0.4);
          outline-offset: 3px;
        }
        .products-card__image-wrap {
          position: relative;
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 18px 40px rgba(53,34,18,0.12);
        }
        .products-card__image-glow {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 35%),
            linear-gradient(0deg, rgba(23,18,15,0.26) 0%, rgba(23,18,15,0) 42%);
          pointer-events: none;
        }
        .products-card__info {
          text-align: left;
        }
        .products-card__meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .products-card__cat {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.72);
          box-shadow: inset 0 0 0 1px rgba(146,105,78,0.12);
          letter-spacing: 0.18em;
        }
        .products-card__hint {
          font-size: 12px;
          color: var(--muted);
          letter-spacing: 0.08em;
        }
        .products-card__title {
          margin: 0;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .products-card__price {
          color: var(--accent);
          font-weight: 800;
          font-size: 20px;
          letter-spacing: -0.02em;
        }
        .products-detail-modal {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 32px;
          background: rgba(23,18,15,0.42);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .products-detail-modal__panel {
          position: relative;
          display: grid;
          grid-template-columns: minmax(320px, 520px) minmax(320px, 480px);
          width: min(1080px, calc(100vw - 64px));
          max-height: calc(100vh - 64px);
          overflow: auto;
          border-radius: 32px;
          background: linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,244,237,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.9);
          box-shadow: 0 40px 120px rgba(0,0,0,0.18);
        }
        .products-detail-modal__close {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 44px;
          height: 44px;
          border: none;
          border-radius: 50%;
          background: rgba(23,18,15,0.08);
          color: var(--ink);
          font-size: 26px;
          line-height: 1;
          cursor: pointer;
          transition: transform 0.25s ease, background 0.25s ease;
        }
        .products-detail-modal__close:hover {
          transform: scale(1.05);
          background: rgba(23,18,15,0.14);
        }
        .products-detail-modal__media {
          padding: 22px;
          background: linear-gradient(180deg, rgba(231,223,210,0.46) 0%, rgba(248,244,237,0.1) 100%);
        }
        .products-detail-modal__hero {
          width: 100%;
          min-height: 100%;
          border-radius: 24px;
          background-size: cover;
          background-position: center;
          box-shadow: 0 28px 72px rgba(53,34,18,0.16);
        }
        .products-detail-modal__content {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 16px;
          padding: 56px 42px 42px;
        }
        .products-detail-modal__tag {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(166,83,63,0.08);
          color: var(--accent);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .products-detail-modal__content h3 {
          margin: 0;
          font-size: 36px;
          line-height: 1.15;
          letter-spacing: -0.03em;
        }
        .products-detail-modal__subhead {
          color: var(--muted);
          font-size: 14px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .products-detail-modal__price {
          font-size: 28px;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: -0.03em;
        }
        .products-detail-modal__description {
          margin: 0;
          color: var(--muted);
          font-size: 15px;
          line-height: 1.9;
          white-space: pre-wrap;
        }
        @media (max-width: 1180px) {
          .portfolio-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .products-detail-modal__panel {
            grid-template-columns: 1fr;
          }
          .products-detail-modal__hero {
            min-height: 360px;
          }
        }
        @media (max-width: 760px) {
          .portfolio-grid {
            grid-template-columns: 1fr !important;
          }
          .products-detail-modal {
            padding: 16px;
          }
          .products-detail-modal__panel {
            width: min(100vw - 32px, 100%);
            max-height: calc(100vh - 32px);
            border-radius: 24px;
          }
          .products-detail-modal__media {
            padding: 16px 16px 0;
          }
          .products-detail-modal__hero {
            min-height: 280px;
          }
          .products-detail-modal__content {
            padding: 24px 20px 28px;
          }
          .products-detail-modal__content h3 {
            font-size: 28px;
          }
        }
      `}</style>
    </>
  );
}
