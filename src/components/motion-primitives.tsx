"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";

const easing = [0.2, 0, 0, 1] as const;

export function useMotionTiming(duration = 0.22) {
  const reducedMotion = useReducedMotion();
  return { duration: reducedMotion ? 0 : duration, ease: easing };
}

type RevealProps = ComponentProps<typeof motion.div> & {
  animateOnMount?: boolean;
  children: ReactNode;
  show?: boolean;
};

export function MotionReveal({
  animateOnMount = false,
  children,
  show = true,
  ...props
}: RevealProps) {
  const transition = useMotionTiming();

  return (
    <AnimatePresence initial={animateOnMount}>
      {show ? (
        <motion.div
          animate={{ height: "auto", opacity: 1, y: 0 }}
          exit={{ height: 0, opacity: 0, y: -6 }}
          initial={{ height: 0, opacity: 0, y: -6 }}
          transition={transition}
          {...props}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export { AnimatePresence, motion };
