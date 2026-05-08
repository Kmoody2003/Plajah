import React, { useEffect, useRef, useState } from 'react';

interface Drop {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  mass: number;
  gravityScale: number;
  friction: number;
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  isHyperSticky: boolean;
}

const CitrusWaterDrops: React.FC = () => {
  const dropsRef = useRef<Drop[]>([]);
  const requestRef = useRef<number | undefined>(undefined);
  const [, setRenderTrigger] = useState(0);

  // Mouse tracking
  const mouseRef = useRef({ x: -1000, y: -1000, vx: 0, vy: 0, lastTime: performance.now() });

  useEffect(() => {
    // Generate initial drops: few dozen drops, scattered randomly
    const initialDrops: Drop[] = Array.from({ length: 36 }).map((_, i) => {
      const size = Math.random() * 80 + 30; // 30px to 110px sizes
      return {
        id: i,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: 0,
        vy: 0,
        baseSize: size,
        mass: size * size,
        gravityScale: Math.random() * 0.1 + 0.01, // Variance in dripping speed
        friction: Math.random() * 0.12 + 0.82, // Variance in "stickiness" to the glass (0.82 to 0.94)
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.05 + 0.01,
        wobbleAmount: Math.random() * 0.1 + 0.05,
        isHyperSticky: Math.random() < 0.3, // 30% chance to be hyper sticky
      };
    });
    dropsRef.current = initialDrops;

    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - mouseRef.current.lastTime);
      
      const mx = e.clientX;
      const my = e.clientY;
      
      // Calculate mouse velocity (pixels per ms)
      const mvx = (mx - mouseRef.current.x) / dt;
      const mvy = (my - mouseRef.current.y) / dt;
      
      mouseRef.current = {
        x: mx,
        y: my,
        vx: mvx,
        vy: mvy,
        lastTime: now
      };
    };

    window.addEventListener('mousemove', handleMouseMove);

    const updatePhysics = () => {
      const drops = dropsRef.current;
      const mouse = mouseRef.current;
      
      // Decay mouse velocity over time if no movement
      const now = performance.now();
      if (now - mouse.lastTime > 50) {
        mouse.vx *= 0.8;
        mouse.vy *= 0.8;
      }

      const mouseSpeed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);

      // Physics step
      for (let i = 0; i < drops.length; i++) {
        let d = drops[i];
        
        // Mouse interaction
        const dx = d.x - mouse.x;
        const dy = d.y - mouse.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        
        // Interaction radius expands slightly when moving fast, but cap it so it doesn't cause chaotic jumps
        const cappedMouseSpeed = Math.min(mouseSpeed, 50);
        const interactionRadius = Math.min(300, 150 + cappedMouseSpeed * 10);

        if (dist < interactionRadius) {
          const force = Math.pow((interactionRadius - dist) / interactionRadius, 2);
          
          if (mouseSpeed > 0.5) {
            // Blast away with kinetic energy
            const pushX = (mouse.vx * force * 5);
            const pushY = (mouse.vy * force * 5);
            d.vx += pushX;
            d.vy += pushY;
          } else {
            // Subtle move out of the way
            d.vx += (dx / dist) * force * 2;
            d.vy += (dy / dist) * force * 2;
          }
        }
        
        // Droplet-droplet collision (soft surface tension push)
        for (let j = i + 1; j < drops.length; j++) {
            let d2 = drops[j];
            const diffX = d2.x - d.x;
            const diffY = d2.y - d.y;
            const distance = Math.max(1, Math.sqrt(diffX*diffX + diffY*diffY));
            const minDistance = (d.baseSize + d2.baseSize) * 0.4; // They can squish together a bit
            
            if (distance < minDistance) {
                const overlap = minDistance - distance;
                const forceMult = (overlap / minDistance) * 0.5; // Spring force
                
                const forceX = (diffX / distance) * forceMult * 10;
                const forceY = (diffY / distance) * forceMult * 10;
                
                // Repel inversely proportional to mass (smaller drops get pushed more)
                const totalMass = d.mass + d2.mass;
                const m1Ratio = d2.mass / totalMass;
                const m2Ratio = d.mass / totalMass;
                
                d.vx -= forceX * m1Ratio;
                d.vy -= forceY * m1Ratio;
                d2.vx += forceX * m2Ratio;
                d2.vy += forceY * m2Ratio;
            }
        }

        // Add tiny random jitter to simulate micro-flows of liquid
        if (Math.random() < 0.1) {
            d.vx += (Math.random() - 0.5) * 0.5;
            d.vy += (Math.random() - 0.5) * 0.5;
        }

        // Extremely slow gravity / dripping effect
        if (!d.isHyperSticky || mouseSpeed > 1) { // hyper sticky drops only move if agitated by mouse or other drops
          d.vy += d.gravityScale * (d.baseSize / 60);
        }

        // Cap maximum velocity to prevent NaN or wild rendering
        d.vx = isNaN(d.vx) ? 0 : Math.max(-50, Math.min(50, d.vx));
        d.vy = isNaN(d.vy) ? 0 : Math.max(-50, Math.min(50, d.vy));

        // Apply velocity
        d.x += d.vx;
        d.y += d.vy;

        // Fluid friction / drag (high friction to simulate sticking to glass)
        d.vx *= d.friction;
        d.vy *= d.friction;

        // Screen boundaries (wrap around for rain effect)
        if (d.y > window.innerHeight + d.baseSize) {
           d.y = -d.baseSize;
           d.x = Math.random() * window.innerWidth;
           d.vx = 0;
           d.vy = Math.random() * 2 + 1;
           // randomize properties of new drop
           d.gravityScale = Math.random() * 0.1 + 0.01;
           d.friction = Math.random() * 0.12 + 0.82;
           d.wobblePhase = Math.random() * Math.PI * 2;
           d.wobbleSpeed = Math.random() * 0.05 + 0.01;
           d.wobbleAmount = Math.random() * 0.1 + 0.05;
           d.isHyperSticky = Math.random() < 0.3;
        } else if (d.y < -d.baseSize - 100) {
           // Let them fly up a bit, then bounce boundary if going too high
           d.vy += 2;
        }
        
        // Update wobble phase
        d.wobblePhase += d.wobbleSpeed;

        if (d.x > window.innerWidth + d.baseSize) {
            d.x = -d.baseSize;
        } else if (d.x < -d.baseSize) {
            d.x = window.innerWidth + d.baseSize;
        }
      }

      setRenderTrigger(prev => prev + 1);
      requestRef.current = requestAnimationFrame(updatePhysics);
    };

    requestRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {dropsRef.current.map((drop) => {
        // Calculate fluid deformation based on current velocity
        const speed = Math.sqrt(drop.vx * drop.vx + drop.vy * drop.vy);
        const angle = Math.atan2(drop.vy, drop.vx) * (180 / Math.PI);
        
        // Wobble perturbation
        const wobbleX = Math.sin(drop.wobblePhase) * drop.wobbleAmount;
        const wobbleY = Math.cos(drop.wobblePhase * 1.5) * drop.wobbleAmount;
        
        // Stretch in direction of movement, squish perpendicular to preserve volume
        const stretchAmount = Math.min(speed * 0.15, 1.8); // Max stretch cap
        const scaleX = 1 + stretchAmount + wobbleX;
        const scaleY = 1 / (1 + stretchAmount * 0.5) + wobbleY; // Slightly imperfect volume preservation for cartoon-ish fluid look

        return (
          <div
            key={drop.id}
            className="absolute citrus-water-drop"
            style={{
              width: `${drop.baseSize}px`,
              height: `${drop.baseSize}px`,
              left: 0,
              top: 0,
              transform: `translate(${drop.x - drop.baseSize/2}px, ${drop.y - drop.baseSize/2}px) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`,
            }}
          />
        );
      })}
    </div>
  );
};

export default CitrusWaterDrops;
