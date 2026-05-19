// src/app/processes/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import { Process } from '@/lib/types';
import {
  getProcesses,
  addProcess,
  updateProcess,
  deleteProcess,
} from '@/lib/firestore';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    no: 1,
    gubun: '',
    jiheung: '',
    model: '',
    jechasa: '',
  });

  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getProcesses();
        setProcesses(data);
      } catch (err) {
        console.error('공정 데이터 로드 오류:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 폼 리셋
  const resetForm = () => {
    setFormData({
      no: 1,
      gubun: '',
      jiheung: '',
      model: '',
      jechasa: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  // 공정 추가
  const handleAddProcess = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        // 수정
        await updateProcess(editingId, {
          no: formData.no,
          gubun: formData.gubun,
          jiheung: formData.jiheung,
          model: formData.model,
          jechasa: formData.jechasa,
        });

        const updatedProcesses = processes.map((p) =>
          p.id === editingId
            ? { ...p, ...formData, timestamp: new Date() }
            : p
        );
        setProcesses(updatedProcesses);
      } else {
        // 새로 추가
        const newId = await addProcess({
          no: formData.no,
          gubun: formData.gubun,
          jiheung: formData.jiheung,
          model: formData.model,
          jechasa: formData.jechasa,
        });

        const newProcess: Process = {
          id: newId,
          ...formData,
          timestamp: new Date(),
        };
        setProcesses([...processes, newProcess]);
      }

      resetForm();
    } catch (err) {
      console.error('공정 저장 오류:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // 공정 수정
  const handleEditProcess = (process: Process) => {
    setFormData({
      no: process.no,
      gubun: process.gubun,
      jiheung: process.jiheung,
      model: process.model,
      jechasa: process.jechasa,
    });
    setEditingId(process.id);
    setShowForm(true);
  };

  // 공정 삭제
  const handleDeleteProcess = async (id: string) => {
    if (!confirm('정말로 삭제하시겠습니까?')) return;

    try {
      await deleteProcess(id);
      setProcesses(processes.filter((p) => p.id !== id));
    } catch (err) {
      console.error('공정 삭제 오류:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gray-100">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">공정 관리</h1>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                새로운 공정 추가
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* 폼 */}
          {showForm && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">
                  {editingId ? '공정 수정' : '새로운 공정 추가'}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <form onSubmit={handleAddProcess} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      공정 번호
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="19"
                      value={formData.no}
                      onChange={(e) =>
                        setFormData({ ...formData, no: parseInt(e.target.value) })
                      }
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      구분 (분류)
                    </label>
                    <select
                      value={formData.gubun}
                      onChange={(e) =>
                        setFormData({ ...formData, gubun: e.target.value })
                      }
                      required
                      className="w-full"
                    >
                      <option value="">선택하세요</option>
                      <option value="네거">네거</option>
                      <option value="표지">표지</option>
                      <option value="제본">제본</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      작업명 (지흥)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 인쇄지중심 1공정"
                      value={formData.jiheung}
                      onChange={(e) =>
                        setFormData({ ...formData, jiheung: e.target.value })
                      }
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      모델
                    </label>
                    <input
                      type="text"
                      placeholder="예: 5204H+"
                      value={formData.model}
                      onChange={(e) =>
                        setFormData({ ...formData, model: e.target.value })
                      }
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      제작사
                    </label>
                    <input
                      type="text"
                      placeholder="예: SCREEN"
                      value={formData.jechasa}
                      onChange={(e) =>
                        setFormData({ ...formData, jechasa: e.target.value })
                      }
                      required
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    {editingId ? '수정' : '추가'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 공정 목록 테이블 */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">로드 중...</p>
            </div>
          ) : processes.length > 0 ? (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>구분</th>
                      <th>작업명</th>
                      <th>모델</th>
                      <th>제작사</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes
                      .sort((a, b) => a.no - b.no)
                      .map((process) => (
                        <tr key={process.id}>
                          <td className="font-medium text-gray-900">{process.no}</td>
                          <td>
                            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                              {process.gubun}
                            </span>
                          </td>
                          <td className="max-w-xs truncate">{process.jiheung}</td>
                          <td>{process.model}</td>
                          <td>{process.jechasa}</td>
                          <td>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditProcess(process)}
                                className="p-2 hover:bg-blue-100 rounded-lg transition-colors text-blue-600"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProcess(process.id)}
                                className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded">
              <p className="text-blue-700">아직 등록된 공정이 없습니다.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
