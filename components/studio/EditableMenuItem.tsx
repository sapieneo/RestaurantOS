'use client'

import { useState, useRef } from 'react'
import { AlertTriangle, Trash2, GripVertical, ImagePlus, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { EditedMenuItem } from '@/types'

interface Props {
  item: EditedMenuItem
  index: number
  onUpdate: (id: string, updates: Partial<EditedMenuItem>) => void
  onDelete: (id: string) => void
}

const CATEGORIES = [
  'Başlangıçlar', 'Çorbalar', 'Salatalar', 'Ana Yemekler',
  'Izgara & Et', 'Deniz Ürünleri', 'Vejetaryen', 'Makarna & Pizza',
  'Burgerler & Sandviçler', 'Yan Lezzetler', 'Tatlılar',
  'Sıcak İçecekler', 'Soğuk İçecekler', 'Alkollü İçecekler', 'Genel',
]

export function EditableMenuItem({ item, index, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isLowConfidence = item.confidence < 0.7

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onUpdate(item.id, { photo_url: url })
  }

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      isLowConfidence ? 'border-amber-300' : 'border-gray-200'
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab" />

        <span className="text-xs font-mono text-gray-400 w-6 flex-shrink-0">{index + 1}</span>

        {/* Ürün adı — compact görünüm */}
        {!expanded && (
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-800 truncate block">{item.name || 'İsimsiz ürün'}</span>
          </div>
        )}

        {expanded && (
          <div className="flex-1">
            <input
              value={item.name}
              onChange={(e) => onUpdate(item.id, { name: e.target.value })}
              placeholder="Ürün adı"
              className="w-full font-medium text-gray-800 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none py-0.5 transition-colors"
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          {isLowConfidence && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Kontrol et
            </span>
          )}

          {/* Fiyat */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
            <span className="text-xs text-gray-400">₺</span>
            <input
              type="number"
              value={item.price ?? ''}
              onChange={(e) => onUpdate(item.id, { price: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0.00"
              className="w-16 text-sm font-semibold text-gray-800 bg-transparent border-0 focus:outline-none text-right"
            />
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onDelete(item.id)}
            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {isLowConfidence && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>AI bu ürünü düşük güvenle okudu. Bilgileri kontrol edip düzeltin.</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {/* Açıklama */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Açıklama</label>
              <textarea
                value={item.description ?? ''}
                onChange={(e) => onUpdate(item.id, { description: e.target.value })}
                placeholder="İçerik açıklaması..."
                rows={2}
                className="input text-sm resize-none"
              />
            </div>

            {/* Kategori */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Kategori</label>
              <select
                value={item.category}
                onChange={(e) => onUpdate(item.id, { category: e.target.value })}
                className="input text-sm"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fotoğraf */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Ürün Fotoğrafı</label>
            {item.photo_url ? (
              <div className="relative inline-block">
                <img
                  src={item.photo_url}
                  alt={item.name}
                  className="w-24 h-24 object-cover rounded-xl border border-gray-200"
                />
                <button
                  onClick={() => onUpdate(item.id, { photo_url: undefined })}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                Fotoğraf ekle
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        </div>
      )}
    </div>
  )
}
