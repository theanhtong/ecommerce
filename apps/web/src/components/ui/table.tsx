'use client';

import * as React from 'react';
import { cn } from 'cn';

// Fits a page's table into the window: it takes the height left by what sits above and below
// it and scrolls inside, so the page itself does not scroll. In a flex-column dialog the table
// takes the room left instead (flex-1, min-h-0), which CSS handles without measuring.
function useFitToWindow(enabled: boolean) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || el.closest('[data-slot=dialog-content]')) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const below =
        document.documentElement.scrollHeight - top - el.offsetHeight;
      el.style.maxHeight = `${Math.max(160, window.innerHeight - top - below)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [enabled]);
  return ref;
}

// fit={false} for a short summary table that should show in full where it sits on the page.
function Table({
  className,
  fit = true,
  ...props
}: React.ComponentProps<'table'> & { fit?: boolean }) {
  const ref = useFitToWindow(fit);
  return (
    <div
      ref={ref}
      data-slot="table-container"
      className="relative w-full overflow-auto in-data-[slot=dialog-content]:min-h-0 in-data-[slot=dialog-content]:flex-1"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'sticky top-0 z-10 bg-card in-data-[slot=dialog-content]:bg-popover [&_tr]:border-b [&_tr]:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
