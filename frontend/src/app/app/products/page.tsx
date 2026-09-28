'use client';
import { products } from '@/features/resources/configs';
import { ResourcePage } from '@/features/resources/resource-page';

export default function Page() {
  return <ResourcePage cfg={products} />;
}
