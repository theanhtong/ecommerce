import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ConfirmButton({
  label,
  title,
  description,
  variant = 'default',
  onConfirm,
  pending,
}: {
  label: string;
  title: string;
  description: string;
  variant?: 'default' | 'outline';
  onConfirm: () => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
