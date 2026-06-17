'use client';

import { useEffect, useState } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';

interface ToastProps {
  message: string | null;
  type?: 'success' | 'error';
  onClose?: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onClose?.(), 300); // wait for fade out
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      className={
        'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 '
        + (visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')
        + (type === 'success'
          ? ' bg-green-600 text-white'
          : ' bg-red-600 text-white')
      }
    >
      {type === 'success'
        ? <Check className='w-4 h-4 shrink-0' />
        : <AlertCircle className='w-4 h-4 shrink-0' />
      }
      <span className='max-w-md truncate'>{message}</span>
      <button onClick={() => { setVisible(false); setTimeout(() => onClose?.(), 300); }}
        className='ml-2 p-0.5 rounded hover:bg-white/20 transition-colors'>
        <X className='w-3.5 h-3.5' />
      </button>
    </div>
  );
}
