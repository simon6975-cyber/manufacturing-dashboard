// src/components/ComingSoon.tsx
'use client';

import React from 'react';
import Sidebar from './Sidebar';
import { Hammer } from 'lucide-react';

const ComingSoon: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
  <div className="flex h-screen bg-black text-white overflow-hidden">
    <Sidebar />
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-5">
          <Hammer className="w-7 h-7 text-gray-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-200">{title}</h1>
        <p className="text-sm text-gray-500 mt-2">
          {description || '준비 중인 기능입니다.'}
        </p>
        <p className="text-xs text-gray-600 mt-4">🚧 곧 만나보실 수 있습니다</p>
      </div>
    </main>
  </div>
);

export default ComingSoon;
