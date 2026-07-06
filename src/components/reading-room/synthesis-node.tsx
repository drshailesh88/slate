import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Link2, Sparkles } from 'lucide-react';
import type { SynthesisNodeData } from '@/lib/reading-room/flow-map';
import { useCanvasContext } from './canvas-context';
import styles from './nodes.module.css';

function SynthesisNodeComponent({ id, data }: NodeProps) {
  const { prompt } = data as SynthesisNodeData;
  const { onPromptChange } = useCanvasContext();

  return (
    <div className={`slate-node ${styles.node}`}>
      <Handle type="target" position={Position.Left} />
      <div className={styles.header}>
        <span className={styles.headerIcon}>
          <Sparkles size={14} strokeWidth={1.75} />
        </span>
        <span className={styles.kind}>Synthesis</span>
      </div>
      <div className={styles.body}>
        <label className={styles.promptLabel} htmlFor={`prompt-${id}`}>
          Prompt
        </label>
        <textarea
          id={`prompt-${id}`}
          className={styles.prompt}
          value={prompt}
          placeholder="Ask a question of the connected sources…"
          onChange={(event) => onPromptChange(id, event.target.value)}
          // stop React Flow from treating typing as canvas drag/hotkeys
          onPointerDownCapture={(event) => event.stopPropagation()}
        />
        <div className={styles.connectHint}>
          <Link2 size={13} strokeWidth={1.75} />
          Connect sources to feed this prompt
        </div>
        <div className={styles.output}>
          Output will appear here — no AI yet.
        </div>
      </div>
    </div>
  );
}

export const SynthesisNode = memo(SynthesisNodeComponent);
