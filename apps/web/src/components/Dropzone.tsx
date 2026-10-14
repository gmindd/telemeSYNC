import { useRef, useState, type ReactNode } from 'react';

export function Dropzone(props: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; children: ReactNode; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone${over ? ' over' : ''}${props.compact ? ' compact' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) props.onFiles(props.multiple ? files : files.slice(0, 1));
      }}
    >
      {props.children}
      <input
        ref={input}
        type="file"
        hidden
        accept={props.accept}
        multiple={props.multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) props.onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
