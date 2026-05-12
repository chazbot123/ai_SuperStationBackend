import { useEffect } from "react";
import legacyHomeMarkup from "./legacy-home-body.html?raw";
import "./legacy-home.css";

const EXTERNAL_SCRIPT_ATTRIBUTE = "data-legacy-home-script";
const BOOT_TIMEOUT_MS = 8000;
const LEGACY_HOME_RUNTIME_VERSION = "20260511-2";

const scriptChain = [
  {
    key: "gsap",
    src: "/vendor/gsap.min.js",
  },
  {
    key: "scroll-trigger",
    src: "/vendor/ScrollTrigger.min.js",
  },
  {
    key: "lenis",
    src: "/vendor/lenis.min.js",
  },
  {
    key: "legacy-home-runtime",
    src: `/legacy-home.js?v=${LEGACY_HOME_RUNTIME_VERSION}`,
  },
  {
    key: "p5",
    src: "/vendor/p5.min.js",
  },
] as const;

function hidePageLoader() {
  const loader = document.querySelector<HTMLElement>(".page-loader");
  if (!loader) return;
  loader.style.display = "none";
  loader.style.transform = "translateY(-100%)";
}

function loadExternalScript(key: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const selector = `script[${EXTERNAL_SCRIPT_ATTRIBUTE}="${key}"]`;
    const existingScript = document.querySelector<HTMLScriptElement>(selector);

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error(`脚本加载失败: ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.loaded = "false";
    script.setAttribute(EXTERNAL_SCRIPT_ATTRIBUTE, key);
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error(`脚本加载失败: ${src}`)), {
      once: true,
    });
    document.body.appendChild(script);
  });
}

export default function LegacyHomePage() {
  useEffect(() => {
    let cancelled = false;
    let bootTimeout = window.setTimeout(() => {
      if (cancelled) return;
      console.warn("legacy home bootstrap timeout, hide loader as fallback");
      hidePageLoader();
    }, BOOT_TIMEOUT_MS);

    const bootLegacyHome = async () => {
      for (const item of scriptChain) {
        if (cancelled) return;
        await loadExternalScript(item.key, item.src);
        if (item.key === "legacy-home-runtime") {
          hidePageLoader();
        }
      }
      window.clearTimeout(bootTimeout);
    };

    bootLegacyHome().catch((error) => {
      console.error("legacy home bootstrap failed", error);
      hidePageLoader();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimeout);
      document.body.classList.remove("overlay-open");
      document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: legacyHomeMarkup }} />;
}
