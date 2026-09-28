'use client';
import { vendors } from '@/features/resources/configs';
import { ResourcePage } from '@/features/resources/resource-page';

export default function Page() {
  return <ResourcePage cfg={vendors} />;
}
