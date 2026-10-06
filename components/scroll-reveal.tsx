"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays its children in once they scroll into view.
 *
 * Starts hidden only after mount, so the content is visible if JavaScript never
 * runs. The observer disconnects on the first intersection — the section is not
 * meant to replay on every pass.
 */
export function ScrollReveal({
  children,
  className = "",
  threshold = 0.15,
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "pending" | "shown">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Already on screen at mount (short viewport, deep link): show it without
    // hiding it first, which would read as a flash.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * (1 - threshold)) {
      setState("shown");
      return;
    }

    setState("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  const motion =
    state === "pending"
      ? "reveal-pending"
      : state === "shown"
        ? "reveal-pending reveal-shown"
        : "";

  return (
    <div ref={ref} className={`${motion} ${className}`}>
      {children}
    </div>
  );
}
