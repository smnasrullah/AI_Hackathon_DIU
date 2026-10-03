import { motion, type HTMLMotionProps } from "motion/react";

import { useReducedMotionPref } from "../../lib/motionPrefs";
import { listStagger, revealVariants } from "../../styles/motion";

type GroupProps<T extends "ul" | "ol" | "div"> = Omit<HTMLMotionProps<T>, "variants" | "initial" | "animate">;
type ItemProps<T extends "li" | "div"> = Omit<HTMLMotionProps<T>, "variants">;

/** Children fade-rise in one after another (40ms apart) on mount; reduced motion keeps a plain fade. */
export function StaggerList({ ...rest }: GroupProps<"ul">) {
  return <motion.ul variants={listStagger} initial="hidden" animate="show" {...rest} />;
}

export function StaggerItem({ ...rest }: ItemProps<"li">) {
  const reduced = useReducedMotionPref();
  return <motion.li variants={revealVariants(reduced)} {...rest} />;
}

/** Same as StaggerList / StaggerItem for grids and stacks that are not lists. */
export function StaggerGroup({ ...rest }: GroupProps<"div">) {
  return <motion.div variants={listStagger} initial="hidden" animate="show" {...rest} />;
}

export function StaggerBlock({ ...rest }: ItemProps<"div">) {
  const reduced = useReducedMotionPref();
  return <motion.div variants={revealVariants(reduced)} {...rest} />;
}
