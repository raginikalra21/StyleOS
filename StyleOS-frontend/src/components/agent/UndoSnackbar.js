import React, { useEffect } from 'react';

export default function UndoSnackbar({ message, onUndo, onDismiss, durationMs = 5000 }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div className="undo-snackbar">
      <span>{message}</span>
      <button onClick={onUndo}>Undo</button>
    </div>
  );
}
