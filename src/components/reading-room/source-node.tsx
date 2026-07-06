import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import type { SourceNodeData } from '@/lib/reading-room/flow-map';
import styles from './nodes.module.css';

function SourceNodeComponent({ data }: NodeProps) {
  const { source } = data as SourceNodeData;

  return (
    <div className={`slate-node ${styles.node}`}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>
          <FileText size={14} strokeWidth={1.75} />
        </span>
        <span className={styles.kind}>Source</span>
      </div>
      <div className={styles.body}>
        {source ? (
          <>
            <h3 className={styles.title}>{source.title}</h3>
            <p className={styles.meta}>
              {source.authors ?? 'Unknown authors'}
              {source.venue ? ` · ${source.venue}` : ''}
              {source.year ? (
                <>
                  {' · '}
                  <span className={styles.year}>{source.year}</span>
                </>
              ) : null}
            </p>
          </>
        ) : (
          <div className={styles.unavailable}>Source unavailable</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const SourceNode = memo(SourceNodeComponent);
