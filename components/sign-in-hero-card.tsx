"use client";

import * as motion from "motion/react-client";
import { useState } from "react";
import Image from "next/image";

export function SignInHeroCard() {
  const [tilt, setTilt] = useState({ x: 0, y: 0, scale: 1 });

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 24;
    const rotateX = (0.5 - py) * 20;
    setTilt({ x: rotateX, y: rotateY, scale: 1.02 });
  }

  function resetTilt() {
    setTilt({ x: 0, y: 0, scale: 1 });
  }

  return (
    <motion.div
      className="sign-in-hero"
      aria-hidden="true"
      style={{ transformPerspective: 1200 }}
      animate={{
        scale: tilt.scale,
        rotateX: tilt.x,
        rotateY: tilt.y,
        rotateZ: tilt.y * -0.08
      }}
      whileTap={{ scale: 0.995 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={resetTilt}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
    >
      <div className="sign-in-hero-mark">
        <Image
          src="/login-pill-mark.svg"
          alt=""
          width={220}
          height={220}
          className="sign-in-hero-mark__img"
          priority
        />
      </div>
    </motion.div>
  );
}
