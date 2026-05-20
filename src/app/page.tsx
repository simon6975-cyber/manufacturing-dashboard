// src/app/page.tsx
'use client';

import React from 'react';
import Sidebar from '../components/Sidebar';
import ProcessFlowDiagram from '../components/ProcessFlowDiagram';

export default function Home() {
  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* 좌측 사이드바 (LNB) */}
      <Sidebar />

      {/* 메인 영역 */}
      <main className="flex-1 min-w-0 overflow-auto">
        <ProcessFlowDiagram />
      </main>
    </div>
  );
}
