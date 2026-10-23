import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Province, Ward } from '@/lib/types';

export function LocationFields({
  provinceCode: initialProvince,
  wardCode,
  onWardChange,
}: {
  provinceCode?: string;
  wardCode?: string;
  onWardChange: (code: string) => void;
}) {
  const [provinceCode, setProvinceCode] = useState(initialProvince ?? '');
  const provinces = useQuery({
    queryKey: ['provinces'],
    queryFn: () => api<Province[]>('/regions/provinces'),
    staleTime: Infinity,
  });
  const wards = useQuery({
    queryKey: ['wards', provinceCode],
    queryFn: () => api<Ward[]>(`/regions/provinces/${provinceCode}/wards`),
    enabled: !!provinceCode,
    staleTime: Infinity,
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label>Tỉnh/Thành phố</Label>
        <Select
          value={provinceCode}
          onValueChange={(code) => {
            setProvinceCode(code);
            onWardChange('');
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Chọn tỉnh/thành phố" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            {provinces.data?.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Phường/Xã</Label>
        <Select
          value={wardCode ?? ''}
          onValueChange={onWardChange}
          disabled={!provinceCode}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Chọn phường/xã" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            {wards.data?.map((w) => (
              <SelectItem key={w.code} value={w.code}>
                {w.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
