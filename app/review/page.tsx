'use client';

import { BulkReviewPanel } from '@/components/bulk-review/BulkReviewPanel';

export default function ReviewPage() {
  return (
    <div className='h-screen flex flex-col bg-background text-foreground'>
      <header className='h-11 flex items-center justify-between px-4 border-b bg-muted/30 shrink-0'>
        <div className='flex items-center gap-4'>
          <a href='/' className='text-sm font-semibold tracking-tight hover:text-primary transition-colors'>
            {'\u9898\u5E93\u6E05\u6D17\u624B\u672F\u53F0'}
          </a>
          <span className='text-xs text-muted-foreground'>/</span>
          <span className='text-xs font-medium text-primary'>{'\u6279\u91CF\u5BA1\u67E5'}</span>
        </div>
      </header>
      <div className='flex-1 min-h-0'>
        <BulkReviewPanel />
      </div>
    </div>
  );
}
