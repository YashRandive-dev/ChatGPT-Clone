'use client';

import { motion } from 'framer-motion';

export function TypingIndicator({ label = 'Thinking…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm text-muted" role="status" aria-label={label}>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-accent"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </div>
  );
}
