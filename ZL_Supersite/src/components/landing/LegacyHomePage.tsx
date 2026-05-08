import { useEffect } from "react";
import legacyHomeMarkup from "./legacy-home-body.html?raw";
import "./legacy-home.css";

const EXTERNAL_SCRIPT_ATTRIBUTE = "data-legacy-home-script";

const scriptChain = [
  {
    key: "gsap",
    src: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js",
  },
  {
    key: "scroll-trigger",
    src: "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js",
  },
  {
    key: "lenis",
    src: "https://cdn.jsdelivr.net/gh/studio-freight/lenis@1.0.27/bundled/lenis.min.js",
  },
  {
    key: "legacy-home-runtime",
    src: "/legacy-home.js",
  },
  {
    key: "p5",
    src: "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js",
  },
] as const;

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

    const bootLegacyHome = async () => {
      for (const item of scriptChain) {
        if (cancelled) return;
        await loadExternalScript(item.key, item.src);
      }
    };

    bootLegacyHome().catch((error) => {
      console.error("legacy home bootstrap failed", error);
    });

    return () => {
      cancelled = true;
      document.body.classList.remove("overlay-open");
      document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: legacyHomeMarkup }} />;
}
